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
  addMilliseconds
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Copy, AlertTriangle, X, Check } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { cn } from '@renderer/lib/utils'
import { Shift } from '../types'

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
  const [targetDate, setTargetDate] = useState<string>('')
  const [warning, setWarning] = useState<string | null>(null)
  const [isCopying, setIsCopying] = useState(false)
  const [sourceCount, setSourceCount] = useState(0)

  const dateLocale = settings.language === 'es' ? es : undefined

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setTargetDate('')
      setWarning(null)
      checkSourceShifts()
    }
  }, [isOpen, sourceDate, view, employeeId])

  // Check how many shifts we are copying
  const checkSourceShifts = async () => {
    try {
      const rangeStart = getRangeStart(sourceDate).toISOString()
      const rangeEnd = getRangeEnd(sourceDate).toISOString()
      
      let shifts: Shift[] = []
      if (employeeId) {
        shifts = await window.api.shifts.get(employeeId, rangeStart, rangeEnd) as Shift[]
      } else {
        shifts = await window.api.shifts.getAll(rangeStart, rangeEnd) as Shift[]
      }
      setSourceCount(shifts.length)
    } catch (e) {
      console.error('Failed to check source shifts', e)
    }
  }

  // Check target when date changes
  useEffect(() => {
    const checkTarget = async () => {
      if (!targetDate) {
        setWarning(null)
        return
      }

      const target = new Date(targetDate)
      const rangeStart = getRangeStart(target).toISOString()
      const rangeEnd = getRangeEnd(target).toISOString()

      try {
        let shifts: Shift[] = []
        if (employeeId) {
            shifts = await window.api.shifts.get(employeeId, rangeStart, rangeEnd) as Shift[]
        } else {
            shifts = await window.api.shifts.getAll(rangeStart, rangeEnd) as Shift[]
        }

        if (shifts.length > 0) {
            setWarning(`${t('copyTargetHasDataWarning') || 'Warning: The target period already has shifts'} (${shifts.length})`)
        } else {
            setWarning(null)
        }
      } catch (e) {
        console.error(e)
      }
    }

    const timer = setTimeout(checkTarget, 500)
    return () => clearTimeout(timer)
  }, [targetDate, employeeId, view])

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

  const handleCopy = async () => {
    if (!targetDate || sourceCount === 0) return
    setIsCopying(true)

    try {
      const sourceStart = getRangeStart(sourceDate)
      const targetStart = getRangeStart(new Date(targetDate))
      
      // Calculate time difference in milliseconds to preserve exact timing
      const diffTime = targetStart.getTime() - sourceStart.getTime()

      // Fetch source shifts again to be safe
      const rangeStart = sourceStart.toISOString()
      const rangeEnd = getRangeEnd(sourceDate).toISOString()
      
      let shifts: Shift[] = []
      if (employeeId) {
        shifts = await window.api.shifts.get(employeeId, rangeStart, rangeEnd) as Shift[]
      } else {
        shifts = await window.api.shifts.getAll(rangeStart, rangeEnd) as Shift[]
      }

      // Prepare new shifts
      const newShifts = shifts.map(s => {
        const oldStart = parseISO(s.startTime)
        const oldEnd = parseISO(s.endTime)
        
        return {
          employeeId: s.employeeId,
          startTime: addMilliseconds(oldStart, diffTime).toISOString(),
          endTime: addMilliseconds(oldEnd, diffTime).toISOString()
        }
      })

      // Insert individually (since we don't have a bulk API exposed in context usually, assuming standard add)
      // If there's a bulk API, use it. Based on package.json, we don't see api details.
      // Assuming standard `window.api.shifts.add`.
      
      await Promise.all(newShifts.map(s => window.api.shifts.add(s)))

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
      <div className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-2xl">
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

        <div className="space-y-4">
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

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-400">
              {t('targetDate') || 'Target Date'}
            </label>
            <input
              type="date"
              required
              className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              {view === 'week' && (t('selectAnyDayInTargetWeek') || 'Select any day in the target week')}
              {view === 'month' && (t('selectAnyDayInTargetMonth') || 'Select any day in the target month')}
            </p>
          </div>

          {warning && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900/50">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>{warning}</div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleCopy}
              disabled={!targetDate || sourceCount === 0 || isCopying}
              className={cn(
                "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
                !targetDate || sourceCount === 0 || isCopying
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
