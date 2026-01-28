import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Save, X, Trash2, AlertTriangle, Copy, Banknote, History, ChevronDown, Lock } from 'lucide-react'
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  parseISO,
  isSameDay,
  differenceInMinutes
} from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '../hooks/useSettings'
import { StatsVisibilityMenu } from './StatsVisibilityMenu'
import ShiftContextMenu from './ShiftContextMenu'
import ConfirmModal from './ConfirmModal'
import CopyShiftsModal from './CopyShiftsModal'
import { calculateMonthStats, MonthlyClosure } from '../lib/balanceUtils'
import { BalanceAdjustment, Employee, Shift } from '../types'

export default function EmployeeDetails(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [monthlyHours, setMonthlyHours] = useState<number>(160)
  const [totalWorkedHours, setTotalWorkedHours] = useState<number>(0)
  const [weeklyTarget, setWeeklyTarget] = useState<number>(40)
  const [weeklyWorked, setWeeklyWorked] = useState<number>(0)
  const [weeklyHoursModal, setWeeklyHoursModal] = useState<{
      isOpen: boolean
      weekStart: Date
      currentHours: number
  }>({
      isOpen: false,
      weekStart: new Date(),
      currentHours: 40
  })

  const [monthlyClosures, setMonthlyClosures] = useState<MonthlyClosure[]>([])
  const [accumulatedBalance, setAccumulatedBalance] = useState<number>(0)
  const [balanceAdjustments, setBalanceAdjustments] = useState<BalanceAdjustment[]>([])
  const [showPayOffModal, setShowPayOffModal] = useState(false)
  const [payOffSnapshot, setPayOffSnapshot] = useState<number>(0)
  const [payOffInput, setPayOffInput] = useState('')
  const [payOffDescription, setPayOffDescription] = useState('')
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [isActionsOpen, setIsActionsOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  // Close actions menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setIsActionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Check if month is locked helper
  const isMonthLocked = (date: Date | string): boolean => {
    const d = typeof date === 'string' ? parseISO(date) : date
    const mId = format(d, 'yyyy-MM')
    const closure = monthlyClosures.find(c => c.monthId === mId)
    return closure?.status === 'LOCKED'
  }

  const fetchLiveBalance = async () => {
    if (!id || !employee) return

    try {
        // 1. Ensure closures are up to date
        const closures = await window.api.monthlyClosures.getAll() as MonthlyClosure[]
        setMonthlyClosures(closures)

        // 2. Determine fetch range
        // Find the earliest relevant date (start of first closed month, or 2020)
        const sortedClosures = [...closures]
            .filter(c => c.status === 'LOCKED')
            .sort((a, b) => a.monthId.localeCompare(b.monthId))
        
        let startStr = '2020-01-01T00:00:00.000Z'
        if (sortedClosures.length > 0) {
            startStr = startOfMonth(parseISO(sortedClosures[0].monthId + '-01')).toISOString()
        }

        const endStr = endOfMonth(currentDate).toISOString()
        
        // 3. Fetch all shifts
        // Ensure ID is a number
        const empId = Number(id)
        const allShifts = await window.api.shifts.get(empId, startStr, endStr) as Shift[]

        // 4. Fetch overrides for the calculation period (Gap + Current)
        // We only need overrides from the *latest* closure onwards, 
        // because previous balances are read from closures.
        const latestClosure = [...closures]
            .filter(c => c.status === 'LOCKED' && c.monthId < format(currentDate, 'yyyy-MM'))
            .sort((a, b) => b.monthId.localeCompare(a.monthId))[0]
        
        let calcStart = latestClosure 
            ? startOfMonth(addDays(parseISO(latestClosure.monthId + '-01'), 32))
            : parseISO(startStr)
            
        const weeksToFetch: string[] = []
        let iter = startOfWeek(calcStart, { weekStartsOn: 1 })
        const endIter = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
        
        // Safety limit to avoid infinite loops
        let safety = 0
        while (iter <= endIter && safety < 1000) {
            weeksToFetch.push(iter.toISOString())
            iter = addDays(iter, 7)
            safety++
        }
        
        const overrides: Record<string, Record<number, number>> = {}
        await Promise.all(weeksToFetch.map(async (weekStr) => {
            try {
                const val = await window.api.employees.getWeeklyHours(empId, weekStr)
                if (typeof val === 'number') {
                    if (!overrides[weekStr]) overrides[weekStr] = {}
                    overrides[weekStr][empId] = val
                }
            } catch (e) {
                console.warn('Failed to fetch weekly hours for', weekStr, e)
            }
        }))

        // 5. Fetch Adjustments
        const adjs = await window.api.balanceAdjustments.get(empId) as BalanceAdjustment[]
        setBalanceAdjustments(adjs)

        // 6. Calculate
        const stats = calculateMonthStats(
            currentDate,
            [employee],
            allShifts || [],
            closures,
            overrides,
            adjs || []
        )

        if (stats && stats[employee.id]) {
            setAccumulatedBalance(stats[employee.id].accumulatedBalance)
        } else {
            // Fallback if calculation fails to return entry for employee
            console.warn("Live balance calculation returned no data for employee, using initial balance")
            setAccumulatedBalance(employee.initialBalance || 0)
        }
    } catch (error) {
        console.error("Failed to fetch live balance", error)
        // In case of error, show initial balance instead of 0 (unless it is 0)
        if (employee) {
            setAccumulatedBalance(employee.initialBalance || 0)
        }
    }
  }

  const { settings, t } = useSettings()
  const dateLocale = settings.language === 'es' ? es : undefined

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: settings.openingTime,
    endTime: settings.closingTime
  })
  const [overlapError, setOverlapError] = useState<string | null>(null)
  const [businessHourWarning, setBusinessHourWarning] = useState<string | null>(null)

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'danger' | 'warning' | 'info'
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {}
  })

  // Validate form data effect
  useEffect(() => {
    const fetchClosures = async () => {
      try {
        const closures = await window.api.monthlyClosures.getAll() as MonthlyClosure[]
        setMonthlyClosures(closures)
      } catch (error) {
        console.error('Failed to fetch monthly closures:', error)
      }
    }
    fetchClosures()
  }, [])

  useEffect(() => {
    const validate = async () => {
      if (!isModalOpen) return
      if (!formData.date || !formData.startTime || !formData.endTime) return
      if (!id) return

      const startDateTime = new Date(`${formData.date}T${formData.startTime}`)
      let endDateTime = new Date(`${formData.date}T${formData.endTime}`)

      // Cross-day check
      if (endDateTime < startDateTime) {
        endDateTime = addDays(endDateTime, 1)
      }

      // Business Hour Warning
      const parseHour = (timeStr: string, defaultHour: number): number => {
        if (!timeStr) return defaultHour
        const h = parseInt(timeStr.split(':')[0])
        return isNaN(h) ? defaultHour : h
      }
      const startHour = parseHour(settings.openingTime, 8)
      const endHour = parseHour(settings.closingTime, 20)
      const safeEndHour = endHour <= startHour ? endHour + 24 : endHour

      const startH = startDateTime.getHours() + startDateTime.getMinutes() / 60
      let endH = endDateTime.getHours() + endDateTime.getMinutes() / 60
      if (!isSameDay(startDateTime, endDateTime)) {
        endH += 24
      }

      if (startH < startHour || endH > safeEndHour) {
        setBusinessHourWarning(t('shiftOutsideBusinessHoursConfirm') || "Warning: Shift is outside business hours")
      } else {
        setBusinessHourWarning(null)
      }

      // Overlap Check
      try {
        const rangeStart = startOfDay(startDateTime).toISOString()
        const rangeEnd = endOfDay(endDateTime).toISOString()
        const fetchedShifts = await window.api.shifts.get(Number(id), rangeStart, rangeEnd) as Shift[]

        const hasOverlap = fetchedShifts.some(s => {
          if (editingShift && s.id === editingShift.id) return false
          const sStart = parseISO(s.startTime)
          const sEnd = parseISO(s.endTime)
          return startDateTime < sEnd && endDateTime > sStart
        })

        if (hasOverlap) {
          setOverlapError(t('shiftOverlapError') || "This shift overlaps with another shift")
        } else {
          setOverlapError(null)
        }
      } catch (e) {
        console.error("Validation failed", e)
      }
    }
    const timer = setTimeout(validate, 300) // Debounce
    return () => clearTimeout(timer)
  }, [formData, isModalOpen, editingShift, id, settings])

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, shift: Shift } | null>(null)

  const fetchShifts = async (): Promise<void> => {
    if (!id) return
    let start: string
    let end: string
    if (view === 'day') {
      start = startOfDay(currentDate).toISOString()
      end = endOfDay(currentDate).toISOString()
    } else if (view === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
      start = startOfDay(weekStart).toISOString()
      end = endOfDay(addDays(weekStart, 6)).toISOString()
    } else {
      // Month view
      const monthStart = startOfMonth(currentDate)
      const monthEnd = endOfMonth(currentDate)
      const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
      const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
      start = startOfDay(calendarStart).toISOString()
      end = endOfDay(calendarEnd).toISOString()
    }
    try {
      const data = await window.api.shifts.get(Number(id), start, end)
      setShifts(data as Shift[])
    } catch (error) {
      console.error('Failed to fetch shifts:', error)
    }
  }

  const fetchStats = async (): Promise<void> => {
    if (!id || !employee) return
    
    // 1. Monthly Stats
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 })
    
    let totalAgreed = 0
    const defaultWeekly = employee.defaultHours || 40
    await Promise.all(weeks.map(async (weekStart) => {
        const weekStr = weekStart.toISOString()
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
        
        let weeklyHours = defaultWeekly
        const override = await window.api.employees.getWeeklyHours(Number(id), weekStr)
        if (typeof override === 'number') {
          weeklyHours = override
        }
        
        // Strict month calculation (Pro-rate)
        let daysInCurrentMonth = 0
        let currentDay = weekStart
        while (currentDay <= weekEnd) {
            if (currentDay >= monthStart && currentDay <= monthEnd) {
                daysInCurrentMonth++
            }
            currentDay = addDays(currentDay, 1)
        }
        
        if (daysInCurrentMonth < 7) {
            totalAgreed += (weeklyHours / 7) * daysInCurrentMonth
        } else {
            totalAgreed += weeklyHours
        }
    }))
    setMonthlyHours(Number(totalAgreed.toFixed(1)))

    const start = startOfMonth(currentDate).toISOString()
    const end = endOfMonth(currentDate).toISOString()
    try {
      const monthShifts = (await window.api.shifts.get(Number(id), start, end)) as Shift[]
      const total = monthShifts.reduce((sum, shift) => {
        const duration = differenceInMinutes(parseISO(shift.endTime), parseISO(shift.startTime)) / 60
        return sum + duration
      }, 0)
      setTotalWorkedHours(total)
    } catch (error) {
      console.error('Failed to fetch month shifts:', error)
    }

    // 2. Weekly Stats
    const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    const weekStr = currentWeekStart.toISOString()
    
    // Target
    try {
        const override = await window.api.employees.getWeeklyHours(Number(id), weekStr)
        setWeeklyTarget(typeof override === 'number' ? override : defaultWeekly)
    } catch (e) {
        setWeeklyTarget(defaultWeekly)
    }

    // Worked
    try {
        const startW = startOfDay(currentWeekStart).toISOString()
        const endW = endOfDay(addDays(currentWeekStart, 6)).toISOString()
        const weekShifts = await window.api.shifts.get(Number(id), startW, endW) as Shift[]
        const worked = weekShifts.reduce((sum, shift) => {
            const duration = differenceInMinutes(parseISO(shift.endTime), parseISO(shift.startTime)) / 60
            return sum + duration
        }, 0)
        setWeeklyWorked(worked)
    } catch (e) {
        console.error('Failed to fetch week shifts', e)
    }
  }

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      if (!id) return
      try {
        const emp = (await window.api.employees.get(Number(id))) as Employee
        setEmployee(emp)
        fetchShifts()
      } catch (error) {
        console.error('Failed to fetch data:', error)
      }
    }
    fetchData()
  }, [id, currentDate, view])

  useEffect(() => {
    if (employee) {
      fetchStats()
      fetchLiveBalance()
    }
  }, [employee, currentDate, shifts])

  const handleContextMenu = (e: React.MouseEvent, shift: Shift) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, shift })
  }

  const handleDeleteShiftDirectly = async (shift: Shift): Promise<void> => {
    if (isMonthLocked(shift.startTime)) {
        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
        return
    }

    setConfirmState({
        isOpen: true,
        title: t('deleteShift'),
        message: t('deleteShiftConfirm'),
        type: 'danger',
        onConfirm: async () => {
            try {
                await window.api.shifts.delete(shift.id)
                fetchShifts()
            } catch (error) {
                console.error('Failed to delete shift:', error)
            } finally {
                setConfirmState(prev => ({ ...prev, isOpen: false }))
            }
        }
    })
  }

  const handleSaveShift = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!id) return
    if (overlapError) return // Prevent save if overlap

    const startDateTime = new Date(`${formData.date}T${formData.startTime}`)
    let endDateTime = new Date(`${formData.date}T${formData.endTime}`)

    if (isMonthLocked(startDateTime)) {
        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
        return
    }

    // Handle cross-day shifts
    if (endDateTime < startDateTime) {
        endDateTime = addDays(endDateTime, 1)
    }

    try {
      if (editingShift) {
        await window.api.shifts.update(editingShift.id, {
          employeeId: Number(id),
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString()
        })
      } else {
        await window.api.shifts.add({
          employeeId: Number(id),
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString()
        })
      }
      handleCloseModal()
      setEditingShift(null)
      fetchShifts()
    } catch (error) {
      console.error('Failed to save shift:', error)
      setConfirmState({
          isOpen: true,
          title: t('error') || 'Error',
          message: t('failedToSaveShift') || 'Failed to save shift',
          type: 'danger',
          onConfirm: () => setConfirmState(prev => ({ ...prev, isOpen: false }))
      })
    }
  }

  const handlePayOff = async () => {
    if (!id) return
    
    const amount = parseFloat(payOffInput)
    if (isNaN(amount) || amount <= 0) return

    // Determine target month for adjustment
    // 1. Try to use the currently viewed month
    let targetMonthDate = currentDate
    
    // 2. If viewed month is locked, try current real-time month (Today)
    if (isMonthLocked(targetMonthDate)) {
        targetMonthDate = new Date()
        
        // 3. If Today is also locked, we cannot proceed
        if (isMonthLocked(targetMonthDate)) {
             alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
             return
        }
    }

    const targetMonthId = format(targetMonthDate, 'yyyy-MM')

    try {
        // Determine direction based on snapshot sign
        // If snapshot > 0 (surplus), we subtract amount (adjustment negative)
        // If snapshot < 0 (debt), we add amount (adjustment positive)
        const direction = payOffSnapshot >= 0 ? -1 : 1
        const adjustmentAmount = direction * amount

        await window.api.balanceAdjustments.add({
            employeeId: Number(id),
            monthId: targetMonthId,
            amount: adjustmentAmount,
            description: payOffDescription || t('balancePayOff') || 'Balance Pay Off',
            createdAt: new Date().toISOString()
        })
        
        setShowPayOffModal(false)
        setPayOffDescription('')
        setPayOffInput('')

        // Show success message to confirm action
        const formattedTargetMonth = format(targetMonthDate, 'MMMM yyyy', { locale: dateLocale })
        alert((t('payOffSuccess') || 'Balance adjustment applied to') + ': ' + formattedTargetMonth)
        
        // If we applied to a different month than viewed, switch to it to see the effect
        // Otherwise just refresh
        if (format(currentDate, 'yyyy-MM') !== targetMonthId) {
            setCurrentDate(targetMonthDate)
            setView('month')
        } else {
            fetchLiveBalance()
            fetchStats()
        }
    } catch (error) {
        console.error("Failed to pay off balance", error)
        alert(t('payOffFailed') || "Failed to save balance adjustment")
    }
  }

  const handleDeleteAdjustment = async (adj: BalanceAdjustment) => {
    if (isMonthLocked(parseISO(adj.monthId + '-01'))) {
         alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
         return
    }
    
    if (!confirm(t('deleteAdjustmentConfirm') || 'Are you sure you want to delete this adjustment?')) return
    
    try {
        await window.api.balanceAdjustments.delete(adj.id)
        fetchLiveBalance()
        fetchStats()
    } catch (error) {
        console.error("Failed to delete adjustment", error)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setOverlapError(null)
    setBusinessHourWarning(null)
  }

  const openAddModal = (): void => {
    setEditingShift(null)
    setFormData({
      date: format(currentDate, 'yyyy-MM-dd'),
      startTime: settings.openingTime,
      endTime: settings.closingTime
    })
    setIsModalOpen(true)
  }

  const openEditModal = (shift: Shift, e: React.MouseEvent): void => {
    e.stopPropagation()
    if (isMonthLocked(shift.startTime)) {
        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
        return
    }
    setEditingShift(shift)
    const start = parseISO(shift.startTime)
    const end = parseISO(shift.endTime)
    setFormData({
      date: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm')
    })
    setIsModalOpen(true)
  }

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    return addDays(weekStart, i)
  })

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const calendarDays: Date[] = []
  let dayIter = calendarStart
  while (dayIter <= calendarEnd) {
      calendarDays.push(dayIter)
      dayIter = addDays(dayIter, 1)
  }

  if (!employee) return <div className="p-8 text-slate-400">{t('loading')}</div>

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/employees')}
            className="rounded-full p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
              {employee.name}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {employee.role} • {employee.department}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-6 py-3 shadow-sm [&>.stat-separator:last-child]:hidden">
          {view === 'month' ? (
            <>
              <div className="text-center">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('month')}
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-200 capitalize">
                  {format(currentDate, 'MMMM', { locale: dateLocale })}
                </div>
              </div>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 stat-separator" />

              {settings.visibleStats.totalWorked && (
                <>
                  <div className="text-center">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t('worked')}
                    </div>
                    <div
                      className={cn(
                        'text-sm font-semibold',
                        totalWorkedHours >= monthlyHours
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      )}
                    >
                      {totalWorkedHours.toFixed(1)}h
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 stat-separator" />
                </>
              )}

              {settings.visibleStats.monthlyTarget && (
                <>
                  <div className="text-center">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t('targetMonthly')}
                    </div>
                    <div className="mt-0.5">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                        {monthlyHours}h
                      </span>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 stat-separator" />
                </>
              )}

              {settings.visibleStats.monthlyDiff && (
                <>
                  <div className="text-center">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t('monthDiff')}
                    </div>
                    <div
                      className={cn(
                        'text-sm font-semibold',
                        totalWorkedHours - monthlyHours >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {totalWorkedHours - monthlyHours > 0 ? '+' : ''}
                      {(totalWorkedHours - monthlyHours).toFixed(1)}h
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 stat-separator" />
                </>
              )}

              <div className="text-center group relative">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('accumulatedBalance') || 'Total Balance'}
                </div>
                <div className="mt-0.5">
                   <div
                      className={cn(
                        'text-sm font-semibold',
                        accumulatedBalance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {accumulatedBalance > 0 ? '+' : ''}
                      {accumulatedBalance.toFixed(1)}h
                    </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-center">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('week')}
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                   {format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d', { locale: dateLocale })}
                </div>
              </div>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 stat-separator" />
              
              <div className="text-center group relative">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t('accumulatedBalance') || 'Total Balance'}
                </div>
                <div className="mt-0.5 flex items-center justify-center gap-2">
                   <div
                      className={cn(
                        'text-sm font-semibold',
                        accumulatedBalance >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {accumulatedBalance > 0 ? '+' : ''}
                      {accumulatedBalance.toFixed(1)}h
                    </div>
                </div>
              </div>

              {settings.visibleStats.totalWorked && (
                <>
                  <div className="text-center">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t('worked')}
                    </div>
                    <div className={cn("text-sm font-semibold", weeklyWorked >= weeklyTarget ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                      {weeklyWorked.toFixed(1)}h
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 stat-separator" />
                </>
              )}

              {settings.visibleStats.weeklyTarget && (
                <>
                  <div 
                     className={cn(
                        "text-center rounded px-2 -mx-2 transition-colors",
                        isMonthLocked(startOfWeek(currentDate, { weekStartsOn: 1 }))
                            ? "cursor-not-allowed opacity-70"
                            : "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                     )}
                     onClick={() => {
                         const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
                         if (isMonthLocked(weekStart)) {
                             alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
                             return
                         }
                         setWeeklyHoursModal({
                             isOpen: true,
                             weekStart,
                             currentHours: weeklyTarget
                         })
                     }}
                     title={isMonthLocked(startOfWeek(currentDate, { weekStartsOn: 1 })) ? (t('monthClosedMessage') || "Month is closed") : (t('editWeeklyHours') || 'Edit Weekly Hours')}
                  >
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                      {t('targetWeekly')} 
                      {!isMonthLocked(startOfWeek(currentDate, { weekStartsOn: 1 })) && (
                          <span className="text-[10px] text-blue-500">({t('edit')})</span>
                      )}
                    </div>
                    <div className="mt-0.5">
                      <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 border-b border-dashed border-blue-400">
                        {weeklyTarget}h
                      </span>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 stat-separator" />
                </>
              )}

              {settings.visibleStats.weeklyDiff && (
                <>
                  <div className="text-center">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {t('weekDiff')}
                    </div>
                    <div className={cn("text-sm font-semibold", weeklyWorked - weeklyTarget >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                       {weeklyWorked - weeklyTarget > 0 ? '+' : ''}{(weeklyWorked - weeklyTarget).toFixed(1)}h
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 stat-separator" />
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4">
        <div className="flex items-center gap-4">
          <div className="flex rounded-md border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-1">
            <button
              onClick={() => setView('day')}
              className={cn(
                'px-3 py-1 text-sm font-medium rounded-sm transition-colors',
                view === 'day'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              {t('day')}
            </button>
            <button
              onClick={() => setView('week')}
              className={cn(
                'px-3 py-1 text-sm font-medium rounded-sm transition-colors',
                view === 'week'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              {t('week')}
            </button>
            <button
              onClick={() => setView('month')}
              className={cn(
                'px-3 py-1 text-sm font-medium rounded-sm transition-colors',
                view === 'month'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              {t('month')}
            </button>
          </div>

          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            {isMonthLocked(currentDate) && (
                <div className="flex items-center space-x-1 px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded text-xs border border-red-100 dark:border-red-900/30 mr-2">
                    <Lock className="h-3 w-3" />
                    <span className="font-medium">{t('locked') || 'Locked'}</span>
                </div>
            )}
            <StatsVisibilityMenu />
            
            <button
              onClick={() => setIsCopyModalOpen(true)}
              className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              title={t('copyShifts') || 'Copy Shifts'}
            >
              <Copy className="h-4 w-4" />
            </button>

            <div className={cn(
                "flex items-center gap-1 px-1 py-0.5 rounded transition-colors",
                isMonthLocked(currentDate) && "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400"
            )}>
                <button
                onClick={() => setCurrentDate((d) => {
                    if (view === 'month') return addMonths(d, -1)
                    return addDays(d, view === 'day' ? -1 : -7)
                })}
                className={cn(
                    "p-1 rounded",
                    isMonthLocked(currentDate) 
                        ? "hover:bg-red-100 dark:hover:bg-red-900/30" 
                        : "hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
                >
                {'<'}
                </button>
                <span className="text-sm font-medium min-w-[120px] text-center">
                {view === 'day'
                    ? format(currentDate, 'MMM d, yyyy', { locale: dateLocale })
                    : view === 'week' 
                    ? `${t('weekOf')} ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d', { locale: dateLocale })}`
                    : format(currentDate, 'MMMM yyyy', { locale: dateLocale })}
                </span>
                <button
                onClick={() => setCurrentDate((d) => {
                    if (view === 'month') return addMonths(d, 1)
                    return addDays(d, view === 'day' ? 1 : 7)
                })}
                className={cn(
                    "p-1 rounded",
                    isMonthLocked(currentDate) 
                        ? "hover:bg-red-100 dark:hover:bg-red-900/30" 
                        : "hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
                >
                {'>'}
                </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
            <div className="relative" ref={actionsRef}>
              <button
                onClick={() => setIsActionsOpen(!isActionsOpen)}
                className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t('actions') || 'Actions'}
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </button>

              {isActionsOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-lg z-50 p-1">
                  <button
                    onClick={() => {
                      setIsActionsOpen(false)
                      // Allow opening pay off modal even if month is locked
                      // The handlePayOff function will handle redirecting the adjustment to the current month
                      setPayOffSnapshot(accumulatedBalance)
                      setPayOffInput(Math.abs(accumulatedBalance).toString())
                      setShowPayOffModal(true)
                    }}
                    disabled={Math.abs(accumulatedBalance) < 0.01}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{t('payOffBalance') || 'Pay Off Balance'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsActionsOpen(false)
                      setShowHistoryModal(true)
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-left"
                  >
                    <History className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>{t('balanceHistory') || 'Balance History'}</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={openAddModal}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" /> {t('addShift')}
            </button>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 overflow-hidden">
        {view === 'week' ? (
          <div className="grid grid-cols-7 divide-x divide-slate-200 dark:divide-slate-800">
            {weekDays.map((day) => {
              const dayShifts = shifts.filter((s) => isSameDay(parseISO(s.startTime), day))
              const isToday = isSameDay(day, new Date())
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                      'min-h-[400px] relative', 
                      isToday && 'bg-blue-50/50 dark:bg-blue-500/5',
                      isMonthLocked(day) && 'bg-slate-50/80 dark:bg-slate-900/40'
                  )}
                >
                  <div className="border-b border-slate-200 dark:border-slate-800 p-3 text-center relative">
                    {isMonthLocked(day) && (
                        <div className="absolute top-1 right-1">
                            <Lock className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                        </div>
                    )}
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {format(day, 'EEE', { locale: dateLocale })}
                    </div>
                    <div
                      className={cn(
                        'mt-1 text-sm font-semibold',
                        isToday
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-700 dark:text-slate-200'
                      )}
                    >
                      {format(day, 'd', { locale: dateLocale })}
                    </div>
                  </div>
                  <div className="p-2 space-y-2">
                    {dayShifts.map((shift) => (
                      <div
                        key={shift.id}
                        onClick={(e) => openEditModal(shift, e)}
                        onContextMenu={(e) => handleContextMenu(e, shift)}
                        className="group relative cursor-pointer rounded border border-blue-200 dark:border-blue-500/30 bg-blue-100 dark:bg-blue-500/10 p-2 text-xs hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors"
                      >
                        <div className="font-medium text-blue-700 dark:text-blue-300">
                          {format(parseISO(shift.startTime), 'HH:mm')} -{' '}
                          {format(parseISO(shift.endTime), 'HH:mm')}
                        </div>
                        <div className="mt-1 text-blue-600/80 dark:text-blue-400/80 text-[10px]">
                          {(
                            (new Date(shift.endTime).getTime() -
                              new Date(shift.startTime).getTime()) /
                            (1000 * 60 * 60)
                          ).toFixed(1)}
                          h
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteShiftDirectly(shift)
                          }}
                          className="absolute right-1 top-1 hidden rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-red-500 hover:text-white group-hover:block"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : view === 'month' ? (
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800">
                 {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(dayName => (
                     <div key={dayName} className="p-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800 last:border-r-0">
                         {dayName}
                     </div>
                 ))}
                 {calendarDays.map((day, i) => {
                   const dayShifts = shifts.filter((s) => isSameDay(parseISO(s.startTime), day))
                   const isToday = isSameDay(day, new Date())
                   const isCurrentMonth = day.getMonth() === currentDate.getMonth()
                   
                   return (
                     <div
                       key={day.toISOString()}
                       className={cn(
                           'min-h-[100px] p-2 transition-colors relative group border-r border-b border-slate-200 dark:border-slate-800',
                           (i + 1) % 7 === 0 && 'border-r-0',
                           isToday && 'bg-blue-50/50 dark:bg-blue-500/5',
                           !isCurrentMonth && 'bg-slate-50/50 dark:bg-slate-900/20 opacity-60',
                           isMonthLocked(day) && 'bg-slate-50/80 dark:bg-slate-900/40'
                       )}
                       onClick={() => {
                            if (isMonthLocked(day)) {
                                alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
                                return
                            }
                            setEditingShift(null)
                            setFormData({
                              date: format(day, 'yyyy-MM-dd'),
                              startTime: settings.openingTime,
                              endTime: settings.closingTime
                            })
                            setIsModalOpen(true)
                       }}
                     >
                       {isMonthLocked(day) && (
                           <div className="absolute top-1 right-1">
                               <Lock className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                           </div>
                       )}
                       <div className="flex justify-between items-start mb-1">
                           <span className={cn("text-xs font-medium", isToday ? "text-blue-600" : "text-slate-500")}>
                               {format(day, 'd')}
                           </span>
                       </div>
                       <div className="space-y-1">
                           {dayShifts.map(shift => (
                               <div key={shift.id} 
                                    className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded px-1 py-0.5 truncate cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/50"
                                    onClick={(e) => openEditModal(shift, e)}
                                    onContextMenu={(e) => handleContextMenu(e, shift)}
                               >
                                   {format(parseISO(shift.startTime), 'HH:mm')} - {format(parseISO(shift.endTime), 'HH:mm')}
                               </div>
                           ))}
                       </div>
                     </div>
                   )
                 })}
             </div>
        ) : (
          <div className="p-4">
            {isMonthLocked(currentDate) && (
                <div className="mb-4 flex items-center gap-2 rounded-md bg-slate-100 dark:bg-slate-900/50 p-3 text-sm text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                    <Lock className="h-4 w-4" />
                    <span>{t('monthClosedMessage') || "This month is closed. Unlock it to make changes."}</span>
                </div>
            )}
            <div className="space-y-2">
              {shifts
                .filter((s) => isSameDay(parseISO(s.startTime), currentDate))
                .map((shift) => (
                  <div
                    key={shift.id}
                    onClick={(e) => openEditModal(shift, e)}
                    onContextMenu={(e) => handleContextMenu(e, shift)}
                    className="flex items-center justify-between rounded border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 p-4 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="text-lg font-medium text-slate-900 dark:text-slate-200">
                        {format(parseISO(shift.startTime), 'HH:mm')} -{' '}
                        {format(parseISO(shift.endTime), 'HH:mm')}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        {(
                          (new Date(shift.endTime).getTime() -
                            new Date(shift.startTime).getTime()) /
                          (1000 * 60 * 60)
                        ).toFixed(1)}{' '}
                        {t('hours')}
                      </div>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (isMonthLocked(shift.startTime)) {
                             alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
                             return
                        }
                        if (confirm(t('deleteShiftConfirm'))) {
                          await window.api.shifts.delete(shift.id)
                          fetchShifts()
                        }
                      }}
                      className="rounded p-2 text-slate-500 dark:text-slate-400 hover:bg-red-500 hover:text-white transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              {shifts.filter((s) => isSameDay(parseISO(s.startTime), currentDate)).length === 0 && (
                <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                  {t('noShiftsForDay')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingShift ? t('editShift') : t('addShift')}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveShift} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('date')}
                </label>
                <input
                  type="date"
                  required
                  className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('startTime')}
                  </label>
                  <input
                    type="time"
                    required
                    className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('endTime')}
                  </label>
                  <input
                    type="time"
                    required
                    className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  />
                </div>
              </div>

              {/* Warnings & Errors */}
              {businessHourWarning && (
                <div className="flex items-center gap-2 rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-900/50">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{businessHourWarning}</span>
                </div>
              )}
              
              {overlapError && (
                <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900/50">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{overlapError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-md border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={!!overlapError}
              className={cn(
                  "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
                  overlapError 
                    ? "bg-slate-400 cursor-not-allowed" 
                    : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              <Save className="h-4 w-4" />
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )}

  <CopyShiftsModal
        isOpen={isCopyModalOpen}
        onClose={() => setIsCopyModalOpen(false)}
        sourceDate={currentDate}
        view={view}
        employeeId={Number(id)}
        onSuccess={fetchShifts}
      />
      
      <ConfirmModal
        isOpen={confirmState.isOpen}
    title={confirmState.title}
    message={confirmState.message}
    type={confirmState.type}
    onConfirm={confirmState.onConfirm}
    onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
    confirmText={t('confirm') || 'Confirm'}
    cancelText={t('cancel') || 'Cancel'}
  />

  {/* Weekly Hours Modal */}
  {weeklyHoursModal.isOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {t('editWeeklyHours') || 'Edit Weekly Hours'}
                </h2>
                <button onClick={() => setWeeklyHoursModal(prev => ({ ...prev, isOpen: false }))} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                    <X className="h-5 w-5" />
                </button>
            </div>
            <div className="mb-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('weekOf') || 'Week of'} {format(weeklyHoursModal.weekStart, 'MMM d')}
                </p>
            </div>
            <form onSubmit={async (e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                const hours = parseFloat(formData.get('hours') as string)
                if (!isNaN(hours)) {
                    try {
                        const weekStr = weeklyHoursModal.weekStart.toISOString()
                        await window.api.employees.setWeeklyHours(Number(id), weekStr, hours)
                        setWeeklyTarget(hours) // Optimistic update
                        setWeeklyHoursModal(prev => ({ ...prev, isOpen: false }))
                        fetchStats() // Refresh to be sure
                        fetchLiveBalance()
                    } catch (err) {
                        console.error("Failed to save", err)
                    }
                }
            }}>
                <div className="space-y-2 mb-4">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t('agreedHours') || 'Agreed Hours'}
                    </label>
                    <input
                        name="hours"
                        type="number"
                        step="0.5"
                        defaultValue={weeklyHoursModal.currentHours}
                        className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                        autoFocus
                    />
                </div>
                <button type="submit" className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    {t('save')}
                </button>
            </form>
        </div>
    </div>
  )}

  {/* Pay Off Modal */}
  {showPayOffModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {t('payOffBalance') || 'Pay Off Balance'}
                </h2>
                <button onClick={() => setShowPayOffModal(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                    <X className="h-5 w-5" />
                </button>
            </div>
            
            <div className="space-y-4">
                <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-4">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-slate-600 dark:text-slate-400">{t('currentBalance') || 'Current Balance'}:</span>
                        <span className={cn("text-lg font-bold", payOffSnapshot >= 0 ? "text-emerald-600" : "text-red-600")}>
                            {payOffSnapshot > 0 ? '+' : ''}{payOffSnapshot.toFixed(1)}h
                        </span>
                    </div>
                    
                    <div className="mt-4">
                       <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">
                         {t('amount') || 'Amount'}
                       </label>
                       <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={payOffInput}
                          onChange={(e) => setPayOffInput(e.target.value)}
                          className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                       />
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {t('payOffExplanation') || 'This action will create an adjustment to set the accumulated balance to zero.'}
                        <br/>
                        <span className="text-blue-600 dark:text-blue-400 mt-1 block">
                            {t('adjustmentAppliedTo') || 'Adjustment will be applied to'}: {format(new Date(), 'MMMM yyyy')}
                        </span>
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t('description') || 'Description'}
                    </label>
                    <input
                        type="text"
                        value={payOffDescription}
                        onChange={(e) => setPayOffDescription(e.target.value)}
                        placeholder={t('payOffPlaceholder') || 'e.g. Paid out overtime'}
                        className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        onClick={() => setShowPayOffModal(false)}
                        className="rounded-md border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
                    >
                        {t('cancel')}
                    </button>
                    <button
                        onClick={handlePayOff}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 flex items-center gap-2"
                    >
                        <Banknote className="h-4 w-4" />
                        {t('confirmPayOff') || 'Pay Off'}
                    </button>
                </div>
            </div>
        </div>
    </div>
  )}

  {/* History Modal */}
  {showHistoryModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-lg rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    {t('balanceHistory') || 'Balance History'}
                </h2>
                <button onClick={() => setShowHistoryModal(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                    <X className="h-5 w-5" />
                </button>
            </div>
            
            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                {balanceAdjustments.length === 0 ? (
                    <div className="text-center text-slate-500 dark:text-slate-400 py-8">
                        {t('noAdjustments') || 'No balance adjustments found'}
                    </div>
                ) : (
                    balanceAdjustments
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map(adj => (
                        <div key={adj.id} className="flex items-center justify-between rounded border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-900/50">
                            <div>
                                <div className="text-sm font-medium text-slate-900 dark:text-white">
                                    {adj.description}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {format(parseISO(adj.createdAt), 'PP p', { locale: dateLocale })}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={cn("text-sm font-bold", adj.amount >= 0 ? "text-emerald-600" : "text-red-600")}>
                                    {adj.amount > 0 ? '+' : ''}{adj.amount.toFixed(1)}h
                                </span>
                                {!isMonthLocked(parseISO(adj.monthId + '-01')) && (
                                    <button
                                        onClick={() => handleDeleteAdjustment(adj)}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                        title={t('delete') || 'Delete'}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>
  )}

  {/* Context Menu */}
      {/* Context Menu */}
      {contextMenu && (
        <ShiftContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={() => {
            // We need a dummy mouse event for openEditModal as it expects one
            // Or we can modify openEditModal to not require it, but for now let's pass a mock
            // Actually openEditModal signature is: (shift: Shift, e: React.MouseEvent)
            // But we can just create a dummy event or make the second arg optional.
            // Let's modify openEditModal to make 'e' optional or handle it being missing.
            // Wait, I cannot modify openEditModal easily here without another call.
            // Let's just cast a dummy object.
            const dummyEvent = { stopPropagation: () => {} } as React.MouseEvent
            openEditModal(contextMenu.shift, dummyEvent)
          }}
          onDelete={() => handleDeleteShiftDirectly(contextMenu.shift)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
