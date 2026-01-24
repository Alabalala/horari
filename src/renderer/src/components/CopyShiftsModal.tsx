import { useState, useEffect } from 'react'
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  addDays, 
  differenceInCalendarDays,
  parseISO,
  addMilliseconds,
  isSameDay
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Copy, AlertTriangle, X, Check, Plus, Trash2, Users, User } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { cn } from '@renderer/lib/utils'
import { Shift, Employee } from '../types'

type CopyShiftsModalProps = {
  isOpen: boolean
  onClose: () => void
  sourceDate: Date
  view: 'day' | 'week' | 'month'
  employeeId?: number // If undefined, copy all employees (General View)
  onSuccess: () => void
}

export default function CopyShiftsModal({
  isOpen,
  onClose,
  sourceDate,
  view,
  employeeId,
  onSuccess
}: CopyShiftsModalProps): React.JSX.Element {
  const { t, settings } = useSettings()
  
  // State
  const [employees, setEmployees] = useState<Employee[]>([])
  
  // Source Selection (for Global View)
  const [sourceEmployeeId, setSourceEmployeeId] = useState<number | 'all'>('all')
  
  // Target Selection
  const [targetMode, setTargetMode] = useState<'same' | 'specific'>('same')
  const [targetEmployeeIds, setTargetEmployeeIds] = useState<number[]>([])
  
  // Date Selection
  const [targetDate, setTargetDate] = useState<string>('') // For Week/Month or temporary input for Day
  const [targetDates, setTargetDates] = useState<string[]>([]) // For Day view multiple dates

  const [warning, setWarning] = useState<string | null>(null)
  const [isCopying, setIsCopying] = useState(false)
  const [sourceCount, setSourceCount] = useState(0)

  const dateLocale = settings.language === 'es' ? es : undefined

  // Load employees
  useEffect(() => {
    window.api.employees.getAll().then((data) => setEmployees(data as Employee[]))
  }, [])

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setTargetDate('')
      setTargetDates([])
      setWarning(null)
      setSourceEmployeeId(employeeId || 'all')
      setTargetMode('same')
      setTargetEmployeeIds([])
      checkSourceShifts()
    }
  }, [isOpen, sourceDate, view, employeeId])

  // Re-check source shifts when source filter changes
  useEffect(() => {
    if (isOpen) {
        checkSourceShifts()
    }
  }, [sourceEmployeeId])

  // Check how many shifts we are copying
  const checkSourceShifts = async () => {
    try {
      const rangeStart = getRangeStart(sourceDate).toISOString()
      const rangeEnd = getRangeEnd(sourceDate).toISOString()
      
      let shifts: Shift[] = []
      // Use sourceEmployeeId if set, otherwise use prop employeeId (which might be undefined -> all)
      // Actually sourceEmployeeId defaults to employeeId prop if present.
      // So we just check sourceEmployeeId.
      
      if (sourceEmployeeId !== 'all') {
        shifts = await window.api.shifts.get(sourceEmployeeId, rangeStart, rangeEnd) as Shift[]
      } else {
        shifts = await window.api.shifts.getAll(rangeStart, rangeEnd) as Shift[]
      }
      setSourceCount(shifts.length)
    } catch (e) {
      console.error('Failed to check source shifts', e)
    }
  }

  // Check target for conflicts (Debounced)
  useEffect(() => {
    const checkTarget = async () => {
        // Determine dates to check
        const datesToCheck: string[] = []
        if (view === 'day') {
            if (targetDates.length === 0 && targetDate) datesToCheck.push(targetDate)
            else if (targetDates.length > 0) datesToCheck.push(...targetDates)
        } else {
            if (targetDate) datesToCheck.push(targetDate)
        }

        if (datesToCheck.length === 0) {
            setWarning(null)
            return
        }

        let totalConflicts = 0

        for (const dateStr of datesToCheck) {
            const tDate = new Date(dateStr)
            const rangeStart = getRangeStart(tDate).toISOString()
            const rangeEnd = getRangeEnd(tDate).toISOString()

            try {
                let shifts: Shift[] = []
                
                // If specific targets, check those employees
                if (targetMode === 'specific' && targetEmployeeIds.length > 0) {
                     // We have to check each employee? Or get all and filter?
                     // getAll is easier then filter in memory if not too large, 
                     // but getting individual might be better. 
                     // Let's just get ALL for the range and filter.
                     const allShifts = await window.api.shifts.getAll(rangeStart, rangeEnd) as Shift[]
                     shifts = allShifts.filter(s => targetEmployeeIds.includes(s.employeeId))
                } 
                // If same employees, check same employees as source
                else {
                    if (sourceEmployeeId !== 'all') {
                        shifts = await window.api.shifts.get(sourceEmployeeId, rangeStart, rangeEnd) as Shift[]
                    } else {
                        shifts = await window.api.shifts.getAll(rangeStart, rangeEnd) as Shift[]
                    }
                }

                totalConflicts += shifts.length
            } catch (e) {
                console.error(e)
            }
        }

        if (totalConflicts > 0) {
            setWarning(`${t('copyTargetHasDataWarning') || 'Warning: The target period already has shifts'} (${totalConflicts})`)
        } else {
            setWarning(null)
        }
    }

    const timer = setTimeout(checkTarget, 500)
    return () => clearTimeout(timer)
  }, [targetDate, targetDates, sourceEmployeeId, targetMode, targetEmployeeIds, view])

  const getRangeStart = (date: Date) => {
    if (view === 'day') return startOfDay(date)
    if (view === 'week') return startOfWeek(date, { weekStartsOn: 1 })
    return startOfMonth(date)
  }

  const getRangeEnd = (date: Date) => {
    if (view === 'day') return endOfDay(date)
    if (view === 'week') return endOfWeek(date, { weekStartsOn: 1 })
    return endOfMonth(date)
  }

  const handleAddDate = () => {
    if (!targetDate) return
    if (!targetDates.includes(targetDate)) {
        setTargetDates([...targetDates, targetDate])
    }
    setTargetDate('')
  }

  const handleRemoveDate = (date: string) => {
    setTargetDates(targetDates.filter(d => d !== date))
  }

  const toggleTargetEmployee = (id: number) => {
    if (targetEmployeeIds.includes(id)) {
        setTargetEmployeeIds(targetEmployeeIds.filter(i => i !== id))
    } else {
        setTargetEmployeeIds([...targetEmployeeIds, id])
    }
  }

  const handleCopy = async () => {
    if (view !== 'day' && !targetDate) return
    if (view === 'day' && targetDates.length === 0 && !targetDate) return
    if (sourceCount === 0) return
    
    // If view is day and user typed a date but didn't click add, include it
    let finalTargetDates = [...targetDates]
    if (view === 'day' && targetDate && !targetDates.includes(targetDate)) {
        finalTargetDates.push(targetDate)
    }
    // If not day view, use targetDate as single item
    if (view !== 'day') {
        finalTargetDates = [targetDate]
    }

    if (finalTargetDates.length === 0) return

    setIsCopying(true)

    try {
      // 1. Fetch Source Shifts
      const sourceRangeStart = getRangeStart(sourceDate)
      const sourceRangeEnd = getRangeEnd(sourceDate)
      
      let sourceShifts: Shift[] = []
      if (sourceEmployeeId !== 'all') {
        sourceShifts = await window.api.shifts.get(sourceEmployeeId, sourceRangeStart.toISOString(), sourceRangeEnd.toISOString()) as Shift[]
      } else {
        sourceShifts = await window.api.shifts.getAll(sourceRangeStart.toISOString(), sourceRangeEnd.toISOString()) as Shift[]
      }

      const promises: Promise<void>[] = []

      // 2. Loop through Target Dates
      for (const tDateStr of finalTargetDates) {
          const tDate = new Date(tDateStr)
          const targetStart = getRangeStart(tDate)
          
          // Time difference
          const diffTime = targetStart.getTime() - sourceRangeStart.getTime()

          // 3. Prepare shifts for this date
          const newShifts = sourceShifts.flatMap(s => {
             const oldStart = parseISO(s.startTime)
             const oldEnd = parseISO(s.endTime)
             
             // Adjusted times
             const newStartTime = addMilliseconds(oldStart, diffTime).toISOString()
             const newEndTime = addMilliseconds(oldEnd, diffTime).toISOString()

             // If Target Mode is Specific, replicate for each target employee
             if (targetMode === 'specific') {
                 return targetEmployeeIds.map(targetEmpId => ({
                     employeeId: targetEmpId,
                     startTime: newStartTime,
                     endTime: newEndTime
                 }))
             } 
             // Else (Same Employee), preserve ID
             else {
                 return [{
                     employeeId: s.employeeId,
                     startTime: newStartTime,
                     endTime: newEndTime
                 }]
             }
          })

          // Add to promises
          newShifts.forEach(s => promises.push(window.api.shifts.add(s)))
      }

      await Promise.all(promises)

      onSuccess()
      onClose()
    } catch (e) {
      console.error('Copy failed', e)
    } finally {
      setIsCopying(false)
    }
  }

  if (!isOpen) return <></>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Copy className="h-5 w-5 text-blue-500" />
            {t('copyShifts') || 'Copy Shifts'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Info Box */}
          <div className="rounded-md bg-slate-50 dark:bg-slate-900 p-3 text-sm text-slate-600 dark:text-slate-400">
            <p>
              <span className="font-semibold">{t('source') || 'Source'}: </span>
              {view === 'day' && format(sourceDate, 'PPP', { locale: dateLocale })}
              {view === 'week' && `${format(getRangeStart(sourceDate), 'MMM d', { locale: dateLocale })} - ${format(getRangeEnd(sourceDate), 'MMM d, yyyy', { locale: dateLocale })}`}
              {view === 'month' && format(sourceDate, 'MMMM yyyy', { locale: dateLocale })}
            </p>
            <p className="mt-1">
              <span className="font-semibold">{t('shiftsToCopy') || 'Shifts to Copy'}: </span>
              {sourceCount}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Left Column: Configuration */}
             <div className="space-y-4">
                 {/* Source Employee Filter (Only if Global View) */}
                 {!employeeId && (
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-400">
                            {t('sourceEmployee') || 'Source Employee'}
                        </label>
                        <select
                            className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                            value={sourceEmployeeId}
                            onChange={(e) => setSourceEmployeeId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        >
                            <option value="all">{t('allEmployees') || 'All Employees'}</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                        </select>
                    </div>
                 )}

                 {/* Target Mode */}
                 <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-400">
                        {t('copyTo') || 'Copy To'}
                    </label>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="targetMode" 
                                value="same" 
                                checked={targetMode === 'same'} 
                                onChange={() => setTargetMode('same')}
                                className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                                <User className="inline h-3 w-3 mr-1" />
                                {t('sameEmployee') || 'Same Employee(s)'}
                            </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="targetMode" 
                                value="specific" 
                                checked={targetMode === 'specific'} 
                                onChange={() => setTargetMode('specific')}
                                className="text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">
                                <Users className="inline h-3 w-3 mr-1" />
                                {t('specificEmployees') || 'Specific Employee(s)'}
                            </span>
                        </label>
                    </div>
                 </div>

                 {/* Target Employees Selection */}
                 {targetMode === 'specific' && (
                     <div className="border border-slate-200 dark:border-slate-800 rounded-md p-2 max-h-[200px] overflow-y-auto">
                        <div className="text-xs text-slate-500 mb-2 flex justify-between">
                            <span>Select Employees</span>
                            <button 
                                onClick={() => setTargetEmployeeIds(targetEmployeeIds.length === employees.length ? [] : employees.map(e => e.id))}
                                className="text-blue-600 hover:underline"
                            >
                                {targetEmployeeIds.length === employees.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        <div className="space-y-1">
                            {employees.map(emp => (
                                <label key={emp.id} className="flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 p-1 rounded cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={targetEmployeeIds.includes(emp.id)}
                                        onChange={() => toggleTargetEmployee(emp.id)}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-300">{emp.name}</span>
                                </label>
                            ))}
                        </div>
                     </div>
                 )}
             </div>

             {/* Right Column: Dates */}
             <div className="space-y-4">
                <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-400">
                        {t('targetDate') || 'Target Date'}
                        {view === 'day' && 's'}
                    </label>
                    
                    <div className="flex gap-2">
                        <input
                            type="date"
                            className="flex-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                        />
                        {view === 'day' && (
                            <button
                                onClick={handleAddDate}
                                disabled={!targetDate}
                                className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 disabled:bg-slate-400"
                            >
                                <Plus className="h-5 w-5" />
                            </button>
                        )}
                    </div>
                    
                    <p className="mt-1 text-xs text-slate-500">
                        {view === 'week' && (t('selectAnyDayInTargetWeek') || 'Select any day in the target week')}
                        {view === 'month' && (t('selectAnyDayInTargetMonth') || 'Select any day in the target month')}
                    </p>

                    {/* Selected Dates List (Only for Day view) */}
                    {view === 'day' && targetDates.length > 0 && (
                        <div className="mt-3 space-y-2">
                            <div className="text-xs font-medium text-slate-500">Selected Dates:</div>
                            <div className="flex flex-wrap gap-2">
                                {targetDates.map(date => (
                                    <div key={date} className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-1 rounded text-sm">
                                        <span>{format(parseISO(date), 'MMM d', { locale: dateLocale })}</span>
                                        <button onClick={() => handleRemoveDate(date)} className="hover:text-red-500">
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {warning && (
                    <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900/50">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>{warning}</div>
                    </div>
                )}
             </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleCopy}
              disabled={(view === 'day' && targetDates.length === 0 && !targetDate) || (view !== 'day' && !targetDate) || sourceCount === 0 || isCopying || (targetMode === 'specific' && targetEmployeeIds.length === 0)}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
                (view === 'day' && targetDates.length === 0 && !targetDate) || (view !== 'day' && !targetDate) || sourceCount === 0 || isCopying || (targetMode === 'specific' && targetEmployeeIds.length === 0)
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500"
              )}
            >
              {isCopying ? (
                <span className="animate-pulse">...</span>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {t('copy') || 'Copy'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
