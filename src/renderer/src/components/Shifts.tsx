import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useMemo, useRef } from 'react'
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addDays,
  isSameDay,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  eachDayOfInterval,
  eachWeekOfInterval,
  differenceInMinutes,
  differenceInMonths,
  differenceInDays,
  subMonths
} from 'date-fns'
import { es } from 'date-fns/locale'
import {DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Plus,
  X,
  Save,
  Trash2,
  GripVertical,
  AlertTriangle,
  Printer,
  Copy,
  Lock,
  Unlock,
  FileText
} from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import ShiftContextMenu from './ShiftContextMenu'
import { Employee, Shift, BalanceAdjustment } from '../types'
import { calculateMonthStats, MonthlyClosure } from '@renderer/lib/balanceUtils'
import { cn } from '@renderer/lib/utils'
import ShiftTimelineItem from './ShiftTimelineItem'
import ConfirmModal from './ConfirmModal'
import { DatePicker } from './DatePicker'
import PrintWeekModal from './PrintWeekModal'
import PrintWeeklyScheduleModal from './PrintWeeklyScheduleModal'
import { StatsVisibilityMenu } from './StatsVisibilityMenu'
import CopyShiftsModal from './CopyShiftsModal'

// Component for the timeline view of a single employee row
const ShiftTimelineContainer = ({
  emp,
  shifts,
  hours,
  startHour,
  totalViewHours,
  onUpdateShift,
  onAddShift,
  onEditShift,
  onContextMenu,
  isLocked
}: {
  emp: Employee
  shifts: Shift[]
  hours: number[]
  startHour: number
  totalViewHours: number
  onUpdateShift: (id: number, start: string, end: string) => Promise<void> | void
  onAddShift: () => void
  onEditShift: (shift: Shift) => void
  onContextMenu: (e: React.MouseEvent, shift: Shift) => void
  isLocked?: boolean
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div 
      ref={containerRef}
      className="flex-1 relative min-h-[80px] bg-slate-50/50 dark:bg-slate-900/20"
      onClick={(e) => {
        // Only trigger add if clicking background, not a shift
        if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('border-l')) {
             onAddShift()
        }
      }}
    >
       {/* Grid lines */}
       <div className="absolute inset-0 flex pointer-events-none">
          {hours.map((hour) => (
            <div key={hour} className="flex-1 border-l border-slate-200 dark:border-slate-800"></div>
          ))}
       </div>

       {shifts.map((shift) => (
          <ShiftTimelineItem
            key={shift.id}
            shift={shift}
            startHour={startHour}
            totalHours={totalViewHours}
            containerRef={containerRef}
            onUpdate={onUpdateShift}
            onEdit={onEditShift}
            onContextMenu={onContextMenu}
            className="top-2 bottom-2" // Override height
          />
       ))}
       
       {/* Hover Add Button (centered or following mouse? Centered is easier for now) */}
       {!isLocked && (
       <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 pointer-events-none">
          <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex-none flex items-center justify-center shadow-sm aspect-square">
             <Plus className="h-3 w-3" />
          </div>
       </div>
       )}
    </div>
  )
}

export default function Shifts(): React.JSX.Element {
  const { t, settings } = useSettings()
  const dateLocale = settings.language === 'es' ? es : undefined
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [monthlyClosures, setMonthlyClosures] = useState<MonthlyClosure[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'week' | 'day' | 'month'>(() => {
    const saved = localStorage.getItem('shiftsView')
    return (saved === 'week' || saved === 'day' || saved === 'month') ? saved : 'week'
  })

  // Persist view state
  useEffect(() => {
    localStorage.setItem('shiftsView', view)
  }, [view])

  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)

  // Business Hours Logic
  const parseHour = (timeStr: string, defaultHour: number): number => {
    if (!timeStr) return defaultHour
    const h = parseInt(timeStr.split(':')[0])
    return isNaN(h) ? defaultHour : h
  }

  const startHour = parseHour(settings.openingTime, 8)
  const endHour = parseHour(settings.closingTime, 20)
  const safeEndHour = endHour <= startHour ? endHour + 24 : endHour
  const totalViewHours = safeEndHour - startHour
  const hours = Array.from({ length: totalViewHours }, (_, i) => startHour + i)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [formData, setFormData] = useState({
    employeeId: 0,
    date: '',
    startTime: '',
    endTime: '',
    type: 'work' as 'work' | 'absence',
    absenceType: 'holiday' as 'holiday' | 'bank_holiday' | 'sick_leave' | 'unpaid' | 'other',
    days: 1,
    isPaid: true
  })
  const [overlapError, setOverlapError] = useState<string | null>(null)
  const [businessHourWarning, setBusinessHourWarning] = useState<string | null>(null)
  
  // Confirm Modal State
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

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, shift: Shift } | null>(null)

  // Print Modal State
  const [printModalState, setPrintModalState] = useState<{
    isOpen: boolean
    employee: Employee | null
  }>({
    isOpen: false,
    employee: null
  })

  const [isPrintWeeklyModalOpen, setIsPrintWeeklyModalOpen] = useState(false)
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false)
  
  // Weekly Hours Overrides State
  const [weeklyHoursOverrides, setWeeklyHoursOverrides] = useState<Record<string, Record<number, number>>>({})
  const [weeklyHoursModal, setWeeklyHoursModal] = useState<{
    isOpen: boolean
    employeeId: number
    employeeName: string
    weekStart: Date
    currentHours: number
  }>({
    isOpen: false,
    employeeId: 0,
    employeeName: '',
    weekStart: new Date(),
    currentHours: 40
  })

  // Validate form data effect
  useEffect(() => {
    const validate = async () => {
        if (!isModalOpen) return
        if (!formData.date || !formData.startTime || !formData.endTime) return

        const startDateTime = new Date(`${formData.date}T${formData.startTime}`)
        let endDateTime = new Date(`${formData.date}T${formData.endTime}`)

        // Cross-day check
        if (endDateTime < startDateTime) {
            endDateTime = addDays(endDateTime, 1)
        }

        // Business Hour Warning
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
        // We use local shifts if possible, but fetching is safer to match existing logic
        try {
            const rangeStart = startOfDay(startDateTime).toISOString()
            const rangeEnd = endOfDay(endDateTime).toISOString()
            const fetchedShifts = await window.api.shifts.get(formData.employeeId, rangeStart, rangeEnd) as Shift[]
            
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
  }, [formData, isModalOpen, editingShift])

  const fetchData = async (silent = false): Promise<void> => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      if (!window.api) {
        throw new Error('API not available. Please restart the application.')
      }

      // 1. Fetch Employees and Closures first
      if (!window.api.employees) throw new Error("API 'employees' missing")
      if (!window.api.monthlyClosures) throw new Error("API 'monthlyClosures' missing")

      const [emps, closures] = await Promise.all([
        window.api.employees.getAll(),
        window.api.monthlyClosures.getAll()
      ])
      const closureList = closures as MonthlyClosure[]
      setMonthlyClosures(closureList)
      setEmployees(emps as Employee[])

      // 2. Determine Fetch Range based on View and Closures
      // We need historical shifts (since last closure) to calculate accumulated balance correctly in Week/Month views.
      let startStr: string | undefined
      let endStr: string | undefined

      if (view === 'week' || view === 'month') {
        const viewStart = view === 'month' ? startOfMonth(currentDate) : startOfWeek(currentDate, { weekStartsOn: 1 })
        
        // Always fetch at least the current view range to ensure visibility
        const viewStartStr = viewStart.toISOString()
        
        const sortedClosures = [...closureList]
            .filter(c => c.status === 'LOCKED')
            .sort((a, b) => b.monthId.localeCompare(a.monthId))
        
        // Find latest closure strictly before the current view period
        const latestClosure = sortedClosures.find(c => c.monthId < format(viewStart, 'yyyy-MM'))
        
        if (latestClosure) {
            // Start from the beginning of the next month after the closure
            const closureDate = parseISO(latestClosure.monthId + '-01')
            const nextMonthStart = addDays(endOfMonth(closureDate), 1)
            // If the calculated start is after our view start (shouldn't happen with correct logic, but safety first),
            // use the view start.
            if (nextMonthStart > viewStart) {
                startStr = viewStartStr
            } else {
                startStr = nextMonthStart.toISOString()
            }
        } else {
            // No prior closures? Fetch everything
            startStr = undefined 
        }

        // Force startStr to be at most viewStart if it was somehow calculated later?
        // Actually, let's just ensure we capture the view range.
        // If we are viewing a closed month, latestClosure might be the month BEFORE it.
        // So startStr = start of Closed Month. This is correct.


        // End date: End of the current view interval
        if (view === 'week') {
            endStr = endOfWeek(currentDate, { weekStartsOn: 1 }).toISOString()
        } else {
             // For month view, ensure we cover the whole month
             endStr = endOfMonth(currentDate).toISOString()
        }
      } else {
        // Day view: Optimize to fetch only relevant days? 
        // Or just fetch the day.
        startStr = startOfDay(currentDate).toISOString()
        endStr = endOfDay(currentDate).toISOString()
      }

      // 3. Fetch Shifts with optimized range
      if (!window.api.shifts) {
         console.error("API Error: window.api.shifts is undefined. Available keys:", window.api ? Object.keys(window.api) : 'window.api is null')
         throw new Error("Internal Error: API 'shifts' module is missing. Please restart the application.")
      }
      const rangeShifts = await window.api.shifts.getAll(startStr, endStr)
      setShifts(rangeShifts as Shift[])

      // 4. Fetch Weekly Hours (unchanged logic)
      const overrides: Record<string, Record<number, number>> = {}
      if (view === 'month' || view === 'week') {
        const rangeStart = view === 'month' ? startOfMonth(currentDate) : startOfWeek(currentDate, { weekStartsOn: 1 })
        const rangeEnd = view === 'month' ? endOfMonth(currentDate) : endOfWeek(currentDate, { weekStartsOn: 1 })
        
        const weeks = eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 })
        await Promise.all(weeks.map(async (weekStart) => {
             const weekStr = weekStart.toISOString()
             try {
                const hours = await window.api.employees.getAllWeeklyHours(weekStr)
                overrides[weekStr] = {}
                hours.forEach(h => {
                    overrides[weekStr][h.employeeId] = h.hours
                })
             } catch (e) {
                console.error("Failed to fetch weekly hours for", weekStr, e)
             }
        }))
      }
      setWeeklyHoursOverrides(overrides)

    } catch (error) {
      console.error('Failed to fetch data:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [currentDate, view])

  // Group employees by department
  const groupedEmployees = useMemo(() => {
    let filtered = employees
    
    if (search) {
      const lowerSearch = search.toLowerCase()
      filtered = filtered.filter(
        (e) =>
          e.name.toLowerCase().includes(lowerSearch) ||
          e.role.toLowerCase().includes(lowerSearch)
      )
    }

    if (departmentFilter !== 'all') {
      filtered = filtered.filter((e) => e.department === departmentFilter)
    }

    // Sort by displayOrder then name
    filtered.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))

    const groups: Record<string, Employee[]> = {}
    filtered.forEach((emp) => {
      if (!groups[emp.department]) {
        groups[emp.department] = []
      }
      groups[emp.department].push(emp)
    })
    return groups
  }, [employees, search, departmentFilter])

  const departments = useMemo(() => {
    const depts = new Set(employees.map((e) => e.department))
    return Array.from(depts).sort()
  }, [employees])

  const days = useMemo(() => {
    if (view === 'day') return [currentDate]
    if (view === 'month') {
        const start = startOfMonth(currentDate)
        const end = endOfMonth(currentDate)
        return eachDayOfInterval({ start, end })
    }
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    const end = endOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate, view])

  const monthWeeks = useMemo(() => {
    if (view !== 'month') return []
    return eachWeekOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) }, { weekStartsOn: 1 })
  }, [currentDate, view])

  const calendarDays = useMemo<Date[]>(() => {
    if (view !== 'month') return []
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: startDate, end: endDate })
  }, [currentDate, view])

  const handleToggleMonthStatus = async () => {
    if (view !== 'month') return

    const monthId = format(currentDate, 'yyyy-MM')
    const existing = monthlyClosures.find(c => c.monthId === monthId && c.status === 'LOCKED')

    if (existing) {
      // Unlock
      const subsequent = monthlyClosures.find(c => c.status === 'LOCKED' && c.monthId > monthId)
      
      setConfirmState({
        isOpen: true,
        title: t('unlockMonth') || 'Unlock Month',
        message: subsequent 
            ? t('unlockMonthWarningSubsequent') || 'Warning: Subsequent months are closed. Unlocking this month may affect their balances.'
            : t('unlockMonthConfirm') || 'Are you sure you want to unlock this month?',
        type: 'danger',
        onConfirm: async () => {
            try {
                await window.api.monthlyClosures.delete(monthId)
                setConfirmState(prev => ({ ...prev, isOpen: false }))
                fetchData()
            } catch (e) {
                console.error(e)
            }
        }
      })
    } else {
      // Close
      const prevMonthDate = subMonths(currentDate, 1)
      const prevMonthId = format(prevMonthDate, 'yyyy-MM')
      
      const sortedClosures = [...monthlyClosures]
        .filter(c => c.status === 'LOCKED')
        .sort((a, b) => b.monthId.localeCompare(a.monthId))
      
      const latestClosure = sortedClosures[0]
      
      if (latestClosure && latestClosure.monthId < prevMonthId) {
          setConfirmState({
              isOpen: true,
              title: t('cannotCloseMonth') || 'Cannot Close Month',
              message: `${t('previousMonthNotClosed') || 'Previous month must be closed first.'} (${format(addMonths(parseISO(latestClosure.monthId + '-01'), 1), 'MMMM yyyy')})`,
              type: 'warning',
              onConfirm: () => setConfirmState(prev => ({ ...prev, isOpen: false }))
          })
          return
      }
      
      // Calculate stats
      // Ensure we have enough data. In month view, we have all shifts.
      // We also need all balance adjustments to ensure the closure includes them
      // And we need the latest closures to ensure we chain correctly
      const [allAdjustments, freshClosures] = await Promise.all([
        window.api.balanceAdjustments.get() as Promise<BalanceAdjustment[]>,
        window.api.monthlyClosures.getAll() as Promise<MonthlyClosure[]>
      ])

      // Determine if we need to fetch historical shifts to fill gaps
      let shiftsToUse = shifts
      const prevClosure = freshClosures.find(c => c.monthId === prevMonthId && c.status === 'LOCKED')
      
      if (!prevClosure) {
        // If previous month is not closed, we might need history to calculate gap from the last closure (or start of time)
        // Find latest closure before this month
        const sorted = [...freshClosures]
            .filter(c => c.status === 'LOCKED' && c.monthId < monthId)
            .sort((a, b) => b.monthId.localeCompare(a.monthId))
        const latest = sorted[0]
        
        // Start from the month after the latest closure, or 2020 if none
        const historyStart = latest 
            ? startOfMonth(addMonths(parseISO(latest.monthId + '-01'), 1)).toISOString()
            : '2020-01-01'
            
        const historyEnd = endOfMonth(currentDate).toISOString()
        
        try {
            // Fetch all shifts in the gap period + current month
            const historicalShifts = await window.api.shifts.getAll(historyStart, historyEnd) as Shift[]
            if (historicalShifts && historicalShifts.length > 0) {
                shiftsToUse = historicalShifts
            }
        } catch (e) {
            console.error("Failed to fetch historical shifts for gap calculation", e)
        }
      }

      const stats = calculateMonthStats(
        currentDate,
        employees,
        shiftsToUse,
        freshClosures,
        weeklyHoursOverrides,
        allAdjustments
      )
      
      const closure: MonthlyClosure = {
        monthId,
        status: 'LOCKED',
        closedAt: new Date().toISOString(),
        balances: JSON.stringify(Object.values(stats))
      }
      
      setConfirmState({
        isOpen: true,
        title: t('closeMonth') || 'Close Month',
        message: `${t('closeMonthConfirm') || 'Are you sure you want to close this month? This will lock the balances.'} (${format(currentDate, 'MMMM yyyy')})`,
        type: 'info',
        onConfirm: async () => {
            try {
                await window.api.monthlyClosures.set(closure)
                setConfirmState(prev => ({ ...prev, isOpen: false }))
                fetchData()
            } catch (error) {
                console.error("Failed to close month", error)
            }
        }
      })
    }
  }

  const handleDragEnd = async (result: DropResult): Promise<void> => {
    const { source, destination, draggableId } = result

    if (!destination) return
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return

    const sourceDept = source.droppableId
    const destDept = destination.droppableId
    
    // Create a copy of employees
    const newEmployees = [...employees]
    
    // Find the moved employee
    const movedEmpIndex = newEmployees.findIndex(e => e.id.toString() === draggableId)
    if (movedEmpIndex === -1) return
    const movedEmp = { ...newEmployees[movedEmpIndex] }

    // Update department if changed
    if (sourceDept !== destDept) {
      movedEmp.department = destDept
      // Update in DB
      await window.api.employees.update(movedEmp.id, {
        name: movedEmp.name,
        role: movedEmp.role,
        department: destDept,
        status: movedEmp.status,
        defaultHours: movedEmp.defaultHours,
        displayOrder: movedEmp.displayOrder
      })
    }

    // Update local state temporarily to prevent flicker
    newEmployees[movedEmpIndex] = movedEmp
    
    // Get employees in destination department
    const destEmployees = newEmployees
      .filter(e => e.department === destDept && e.id !== movedEmp.id)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    
    // Strategy: Assign new, unique, increasing displayOrders to the destination group.
    // We use Date.now() as a base to ensure uniqueness across potential other updates,
    // and add the index to ensure strict ordering within the department.
    const baseOrder = Date.now()

    // Insert at new index
    destEmployees.splice(destination.index, 0, movedEmp)

    // Reassign orders
    const updates: Promise<void>[] = []
    destEmployees.forEach((emp, index) => {
      // Assign strictly increasing order
      emp.displayOrder = baseOrder + index
      updates.push(window.api.employees.updateOrder(emp.id, emp.displayOrder))
    })

    // Update state
    setEmployees(newEmployees.map(e => {
        const updated = destEmployees.find(de => de.id === e.id)
        return updated || e
    }))

    // Execute updates
    try {
        await Promise.all(updates)
    } catch (err) {
        console.error("Failed to update order", err)
        fetchData() // Revert on error
    }
  }

  const handleContextMenu = (e: React.MouseEvent, shift: Shift) => {
    e.preventDefault()
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
                fetchData()
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
    if (overlapError) return // Prevent save if overlap

    if (editingShift && isMonthLocked(editingShift.startTime)) {
        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
        return
    }
    if (isMonthLocked(formData.date)) {
        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
        return
    }

    try {
        if (formData.type === 'absence') {
            const employee = employees.find(e => e.id === formData.employeeId)
            if (!employee) return

            // Calculate daily average hours
            const dailyHours = employee.defaultHours / 7
            // Start at 9:00 AM default for absence visual
            const startTimeStr = "09:00"
            const startHour = 9
            // End time based on duration
            const durationMinutes = Math.round(dailyHours * 60)
            const endHour = startHour + (durationMinutes / 60)
            // Format end time HH:mm
            const endH = Math.floor(endHour)
            const endM = Math.round((endHour % 1) * 60)
            const endTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`

            const baseDate = parseISO(formData.date)
            const daysToCreate = editingShift ? 1 : formData.days

            const promises: Promise<any>[] = []

            for (let i = 0; i < daysToCreate; i++) {
                const currentDate = addDays(baseDate, i)
                const dateStr = format(currentDate, 'yyyy-MM-dd')
                const startDateTime = new Date(`${dateStr}T${startTimeStr}`)
                const endDateTime = new Date(`${dateStr}T${endTimeStr}`)
                
                // If it crosses day (unlikely for <24h), handle it
                if (endDateTime < startDateTime) {
                    // This shouldn't happen with 9am start and typical 8h shift
                    endDateTime.setDate(endDateTime.getDate() + 1) 
                }

                const shiftData = {
                    employeeId: formData.employeeId,
                    startTime: startDateTime.toISOString(),
                    endTime: endDateTime.toISOString(),
                    type: 'absence' as const,
                    absenceType: formData.absenceType,
                    isPaid: formData.isPaid
                }

                if (editingShift) {
                     promises.push(window.api.shifts.update(editingShift.id, shiftData))
                } else {
                     promises.push(window.api.shifts.add(shiftData))
                }
            }

            await Promise.all(promises)

        } else {
            const startDateTime = new Date(`${formData.date}T${formData.startTime}`)
            let endDateTime = new Date(`${formData.date}T${formData.endTime}`)

            // Handle cross-day shifts: if end time < start time, assume it ends the next day
            if (endDateTime < startDateTime) {
                endDateTime = addDays(endDateTime, 1)
            }

            const shiftData = {
                employeeId: formData.employeeId,
                startTime: startDateTime.toISOString(),
                endTime: endDateTime.toISOString(),
                type: 'work' as const,
                absenceType: null,
                isPaid: true
            }

            if (editingShift) {
                await window.api.shifts.update(editingShift.id, shiftData)
            } else {
                await window.api.shifts.add(shiftData)
            }
        }

        handleCloseModal()
        fetchData()
    } catch (error) {
        console.error('Failed to save shift:', error)
    }
  }

  const handleDeleteShift = async (): Promise<void> => {
    if (!editingShift) return
    if (isMonthLocked(editingShift.startTime)) {
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
                await window.api.shifts.delete(editingShift.id)
                handleCloseModal()
                fetchData()
            } catch (error) {
                console.error('Failed to delete shift:', error)
            } finally {
                setConfirmState(prev => ({ ...prev, isOpen: false }))
            }
        }
    })
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setOverlapError(null)
    setBusinessHourWarning(null)
  }

  const isMonthLocked = (date: Date | string) => {
    const d = typeof date === 'string' ? parseISO(date) : date
    const monthId = format(d, 'yyyy-MM')
    return monthlyClosures.some(c => c.monthId === monthId && c.status === 'LOCKED')
  }

  const openAddModal = (employeeId: number, date: Date): void => {
    if (isMonthLocked(date)) {
        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
        return
    }
    setEditingShift(null)
    setFormData({
      employeeId,
      date: format(date, 'yyyy-MM-dd'),
      startTime: settings.openingTime,
      endTime: settings.closingTime,
      type: 'work',
      absenceType: 'holiday',
      days: 1,
      isPaid: true
    })
    setIsModalOpen(true)
  }

  const openEditModal = (shift: Shift): void => {
    if (isMonthLocked(shift.startTime)) {
        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
        return
    }
    setEditingShift(shift)
    const start = parseISO(shift.startTime)
    const end = parseISO(shift.endTime)
    setFormData({
      employeeId: shift.employeeId,
      date: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm'),
      type: shift.type || 'work',
      absenceType: shift.absenceType || 'holiday',
      days: 1, // Editing implies single shift usually
      isPaid: shift.isPaid !== undefined ? !!shift.isPaid : true
    })
    setIsModalOpen(true)
  }

  const handleUpdateShiftTimeline = async (id: number, startTime: string, endTime: string) => {
     if (isMonthLocked(startTime)) {
        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
        fetchData()
        return
     }
     
     // Check original shift time to prevent moving OUT of a locked month
     const currentShift = shifts.find(s => s.id === id)
     if (currentShift && isMonthLocked(currentShift.startTime)) {
        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
        fetchData()
        return
     }

     // Validate business hours
    const start = parseISO(startTime)
    const end = parseISO(endTime)
    
    // Normalize hours for check
    const startH = start.getHours() + start.getMinutes() / 60
    let endH = end.getHours() + end.getMinutes() / 60
    if (!isSameDay(start, end)) {
        endH += 24
    }

    if (startH < startHour || endH > safeEndHour) {
      setConfirmState({
          isOpen: true,
          title: t('warning') || 'Warning',
          message: t('shiftOutsideBusinessHoursConfirm') || "Shift is outside business hours. Do you want to continue?",
          type: 'warning',
          onConfirm: async () => {
              setConfirmState(prev => ({ ...prev, isOpen: false }))
              await proceedUpdate(id, startTime, endTime)
          }
      })
      // Force a re-render to revert the drag visually until confirmed
      setShifts([...shifts])
      return
    }

    await proceedUpdate(id, startTime, endTime)
  }

  const proceedUpdate = async (id: number, startTime: string, endTime: string) => {
    const start = parseISO(startTime)
    const end = parseISO(endTime)
    
    // Overlap Check
    const currentShift = shifts.find(s => s.id === id)
    if (!currentShift) return

    try {
        // Fetch potentially overlapping shifts for robust validation
        const rangeStart = startOfDay(start).toISOString()
        const rangeEnd = endOfDay(end).toISOString()
        const fetchedShifts = await window.api.shifts.get(currentShift.employeeId, rangeStart, rangeEnd) as Shift[]
        
        const hasOverlap = fetchedShifts.some(s => {
            if (s.id === id) return false
            // employeeId check is implicit if we fetched by employeeId
            
            const sStart = parseISO(s.startTime)
            const sEnd = parseISO(s.endTime)
            return start < sEnd && end > sStart
        })

        if (hasOverlap) {
            setConfirmState({
                isOpen: true,
                title: t('error') || 'Error',
                message: t('shiftOverlapError') || "This shift overlaps with another shift for the same employee.",
                type: 'danger',
                onConfirm: () => setConfirmState(prev => ({ ...prev, isOpen: false }))
            })
            fetchData()
            return
        }

        await window.api.shifts.update(id, { employeeId: currentShift.employeeId, startTime, endTime })
        // Optimistic update
        setShifts(prev => prev.map(s => s.id === id ? { ...s, startTime, endTime } : s))
        
        // Ensure persistence by refetching silently
        await fetchData(true)
    } catch (err) {
        console.error("Failed to update shift", err)
        fetchData()
    }
  }

  const getShiftDuration = (shift: Shift): number => {
    const start = parseISO(shift.startTime)
    const end = parseISO(shift.endTime)
    return differenceInMinutes(end, start) / 60
  }

  const monthStats = useMemo(() => {
    if (view !== 'month' && view !== 'week') return {}
    return calculateMonthStats(
        currentDate, 
        employees, 
        shifts, 
        monthlyClosures, 
        weeklyHoursOverrides
    )
  }, [currentDate, employees, shifts, monthlyClosures, weeklyHoursOverrides, view])

  // Calculate stats for Month View (Legacy/Week View support)
  const getEmployeeMonthStats = (emp: Employee, strictMonth: boolean = true) => {
    // 1. Weekly breakdown
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 })
    
    const weeklyData = weeks.map(weekStart => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
        
        const weekShifts = shifts.filter(s => 
            s.employeeId === emp.id && 
            parseISO(s.startTime) >= weekStart && 
            parseISO(s.endTime) <= endOfDay(weekEnd)
        )
        const worked = weekShifts.reduce((acc, s) => acc + getShiftDuration(s), 0)
        
        const weekStr = weekStart.toISOString()
        const override = weeklyHoursOverrides[weekStr]?.[emp.id]
        const baseWeeklyHours = override !== undefined ? override : (emp.defaultHours || 40)
        
        let agreed = baseWeeklyHours

        // Pro-rate agreed hours if week is split across months AND strictMonth is true
        if (strictMonth) {
            const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd })
            const daysInCurrentMonth = daysInWeek.filter(d => 
                d >= monthStart && d <= monthEnd
            ).length
            
            if (daysInCurrentMonth < 7) {
                agreed = (baseWeeklyHours / 7) * daysInCurrentMonth
            }
        }
        
        return {
            weekStart,
            worked,
            agreed: Number(agreed.toFixed(2)),
            diff: worked - agreed
        }
    })

    // Use memoized monthStats for totals if available (handles closures and hybrid balance)
    const empStats = monthStats[emp.id]
    
    let totalWorked = 0
    let totalAgreed = 0
    let diff = 0
    let lifetimeBalance = 0

    if (empStats) {
        // Use the consistent stats from balanceUtils
        totalWorked = empStats.actualHours
        totalAgreed = empStats.targetHours
        diff = empStats.monthlyDifference
        lifetimeBalance = empStats.accumulatedBalance
    } else {
        // Fallback
        totalWorked = weeklyData.reduce((acc, w) => acc + w.worked, 0)
        totalAgreed = weeklyData.reduce((acc, w) => acc + w.agreed, 0)
        diff = totalWorked - totalAgreed
        lifetimeBalance = (emp.initialBalance || 0) + diff 
    }

    return { weeklyData, totalWorked, totalAgreed, diff, lifetimeBalance, weeks }
  }

  const getShiftsForCell = (employeeId: number, date: Date) => {
    return shifts.filter(
      (s) => s.employeeId === employeeId && isSameDay(parseISO(s.startTime), date)
    )
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{t('shifts')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('shiftsDescription')}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-1">
             <button
              onClick={() => {
                if (view === 'month') {
                    setCurrentDate(addMonths(currentDate, -1))
                } else {
                    setCurrentDate(addDays(currentDate, view === 'week' ? -7 : -1))
                }
              }}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="relative">
              <button
                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                className={cn(
                    "text-sm font-medium min-w-[140px] text-center capitalize hover:bg-slate-100 dark:hover:bg-slate-800 rounded px-2 py-1 transition-colors flex items-center justify-center gap-2",
                    isMonthLocked(currentDate) && "text-red-600 dark:text-red-400"
                )}
              >
                {isMonthLocked(currentDate) && <Lock className="h-3 w-3" />}
                {view === 'week' 
                  ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d', { locale: dateLocale })} - ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d', { locale: dateLocale })}`
                  : view === 'month' 
                    ? format(currentDate, 'MMMM yyyy', { locale: dateLocale })
                    : format(currentDate, 'MMM d, yyyy', { locale: dateLocale })
                }
              </button>
              <DatePicker 
                isOpen={isDatePickerOpen}
                onClose={() => setIsDatePickerOpen(false)}
                selectedDate={currentDate}
                onChange={(date) => setCurrentDate(date)}
                mode={view}
              />
            </div>
            <button
              onClick={() => {
                if (view === 'month') {
                    setCurrentDate(addMonths(currentDate, 1))
                } else {
                    setCurrentDate(addDays(currentDate, view === 'week' ? 7 : 1))
                }
              }}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

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
          
          <button
            onClick={() => setIsCopyModalOpen(true)}
            className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            title={t('copyShifts') || 'Copy Shifts'}
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('searchEmployees')}
            className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent py-2 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            className="rounded-md border border-slate-200 dark:border-slate-800 bg-transparent py-2 pl-2 pr-8 text-sm focus:border-blue-500 focus:outline-none"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="all" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">{t('allDepartments')}</option>
            {departments.map((dept) => (
              <option key={dept} value={dept} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">
                {dept}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center gap-2 ml-auto">
          {view === 'month' && (
            <button
              onClick={handleToggleMonthStatus}
              className={cn(
                "flex items-center gap-2 px-3 py-2 border rounded-md transition-colors text-sm font-medium",
                monthlyClosures.find(c => c.monthId === format(currentDate, 'yyyy-MM') && c.status === 'LOCKED')
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  : "bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              {monthlyClosures.find(c => c.monthId === format(currentDate, 'yyyy-MM') && c.status === 'LOCKED') ? (
                <>
                  <Lock className="h-4 w-4" />
                  {t('monthClosed') || 'Month Closed'}
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4" />
                  {t('closeMonth') || 'Close Month'}
                </>
              )}
            </button>
          )}
          <StatsVisibilityMenu />
          {view === 'week' && (
            <button
              onClick={() => setIsPrintWeeklyModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <Printer className="h-4 w-4" />
              {t('printSchedule') || "Print Schedule"}
            </button>
          )}
        </div>
      </div>

      {/* Shifts Grid */}
      <div className="flex-1 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : error ? (
            <div className="p-8 text-center text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg m-4">
                <p className="font-semibold">Error loading shifts</p>
                <p className="text-sm mt-2">{error}</p>
                <div className="flex justify-center gap-4 mt-4">
                    <button 
                        onClick={() => fetchData()}
                        className="px-4 py-2 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors"
                    >
                        Retry
                    </button>
                    <button 
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        Reload App
                    </button>
                </div>
            </div>
        ) : Object.keys(groupedEmployees).length === 0 ? (
            <div className="p-8 text-center text-slate-500">
                <p>No employees found.</p>
                <p className="text-sm mt-2">Go to Employees page to add staff.</p>
            </div>
        ) : (
        <div className="min-w-[1000px]">
           {/* Grid Header */}
           <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <div className="w-8 flex-shrink-0 border-r border-slate-200 dark:border-slate-800"></div>
            <div className="w-48 flex-shrink-0 p-4 font-medium text-slate-500 dark:text-slate-400">
              {t('employee')}
            </div>
            
            {view === 'week' && (
                <div className="w-40 flex-shrink-0 p-4 font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 text-center">
                    {t('summary') || 'Summary'}
                </div>
            )}
            
            {view === 'day' ? (
                <div className="flex-1 flex relative h-14">
                    {hours.map((hour) => (
                        <div key={hour} className="flex-1 text-left pl-1 text-[10px] text-slate-400 border-l border-slate-200 dark:border-slate-800 h-full flex items-end pb-2">
                           {String(hour % 24).padStart(2, '0')}:00
                        </div>
                    ))}
                    {/* Final Hour Label */}
                    <div className="absolute right-0 bottom-2 text-[10px] text-slate-400 translate-x-1/2">
                        {String(safeEndHour % 24).padStart(2, '0')}:00
                    </div>
                </div>
            ) : view === 'month' ? (
                <div className="flex-1 flex">
                    {monthWeeks.map((weekStart, i) => (
                        <div key={weekStart.toISOString()} className={cn(
                            "w-24 flex-shrink-0 p-4 font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 text-center text-xs uppercase tracking-wider relative",
                            isMonthLocked(weekStart) && "bg-slate-50/80 dark:bg-slate-900/40"
                        )}>
                            {isMonthLocked(weekStart) && (
                                <div className="absolute top-1 right-1">
                                    <Lock className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                                </div>
                            )}
                            {t('week')} {i + 1}
                        </div>
                    ))}
                    {settings.visibleStats.totalWorked && (
                        <div className="w-28 flex-shrink-0 p-4 font-semibold text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800 text-center bg-slate-50/80 dark:bg-slate-900/50 text-xs uppercase tracking-wider">{t('totalWorked') || 'Worked'}</div>
                    )}
                    {settings.visibleStats.monthlyTarget && (
                        <div className="w-28 flex-shrink-0 p-4 font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 text-center bg-slate-50/80 dark:bg-slate-900/50 text-xs uppercase tracking-wider">{t('targetMonthly') || 'Target'}</div>
                    )}
                    {settings.visibleStats.monthlyDiff && (
                        <div className="w-28 flex-shrink-0 p-4 font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 text-center bg-slate-50/80 dark:bg-slate-900/50 text-xs uppercase tracking-wider">{t('monthDiff') || 'Diff'}</div>
                    )}
                    {settings.visibleStats.lifetimeBalance && (
                        <div className="w-32 flex-shrink-0 p-4 font-bold text-slate-700 dark:text-slate-200 border-l border-slate-200 dark:border-slate-800 text-center bg-slate-100 dark:bg-slate-800 text-xs uppercase tracking-wider shadow-inner">{t('lifetimeBalance') || 'Balance'}</div>
                    )}
                </div>
            ) : (
                days.map(day => (
                  <div 
                    key={day.toISOString()} 
                    className={cn(
                        "flex-1 p-4 text-center border-l border-slate-200 dark:border-slate-800 relative overflow-hidden", 
                        isSameDay(day, new Date()) && "bg-blue-50/50 dark:bg-blue-500/5",
                        isMonthLocked(day) && "bg-slate-50/80 dark:bg-slate-900/40"
                    )}
                  >
                    {isMonthLocked(day) && (
                        <div className="absolute top-1 right-1">
                            <Lock className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                        </div>
                    )}
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{format(day, 'EEE', { locale: dateLocale })}</div>
                    <div className={cn("text-sm font-semibold", isSameDay(day, new Date()) ? "text-blue-600 dark:text-blue-400" : "text-slate-900 dark:text-slate-200")}>{format(day, 'd', { locale: dateLocale })}</div>
                  </div>
                ))
            )}
           </div>

           <DragDropContext onDragEnd={handleDragEnd}>
             {Object.entries(groupedEmployees).map(([dept, emps]) => (
               <div key={dept}>
                 {/* Department Header */}
                 <div className="bg-slate-100/50 dark:bg-slate-900/80 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                   {dept}
                 </div>
                 
                 <Droppable droppableId={dept}>
                   {(provided) => (
                     <div ref={provided.innerRef} {...provided.droppableProps}>
                       {emps.map((emp, index) => (
                         <Draggable key={emp.id} draggableId={emp.id.toString()} index={index}>
                           {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={cn(
                                "flex items-stretch border-b border-slate-200 dark:border-slate-800 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/30",
                                snapshot.isDragging && "bg-white dark:bg-slate-800 shadow-lg ring-1 ring-slate-200 dark:ring-slate-700 z-50"
                              )}
                            >
                              {/* Drag Handle */}
                              <div 
                                className="w-8 flex-shrink-0 flex items-center justify-center border-r border-slate-200 dark:border-slate-800 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                {...provided.dragHandleProps}
                              >
                                <GripVertical className="h-4 w-4" />
                              </div>

                              {/* Employee Info */}
                             <div className="w-48 flex-shrink-0 p-4 border-r border-slate-200 dark:border-slate-800 flex justify-between items-center group/emp">
                                <div>
                                    <div 
                                       className="font-medium text-slate-900 dark:text-slate-200 cursor-pointer hover:underline select-none truncate w-32 flex items-center gap-2"
                                       onDoubleClick={() => navigate(`/employees/${emp.id}`)}
                                       title={emp.name}
                                    >
                                       <span>{emp.name}</span>
                                       {view === 'day' && isMonthLocked(currentDate) && <Lock className="h-3 w-3 text-red-500" />}
                                       {view === 'week' && (() => {
                                           const stats = getEmployeeMonthStats(emp, false)
                                           const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
                                           const weekData = stats.weeklyData.find(w => isSameDay(w.weekStart, currentWeekStart))
                                           return weekData ? (
                                               <span className="text-xs text-slate-400 font-normal">({weekData.agreed}h)</span>
                                           ) : null
                                       })()}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">{emp.role}</div>
                                </div>
                                {view !== 'month' && (
                                    <button
                                        onClick={() => setPrintModalState({ isOpen: true, employee: emp })}
                                        className="opacity-0 group-hover/emp:opacity-100 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                                        title={t('printSchedule') || "Print Schedule"}
                                    >
                                        <Printer className="h-4 w-4" />
                                    </button>
                                )}
                              </div>

                              {view === 'week' && (() => {
                                  const stats = getEmployeeMonthStats(emp, false)
                                  const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
                                  // Find week data that matches the current week start
                                  const weekData = stats.weeklyData.find(w => isSameDay(w.weekStart, currentWeekStart))
                                  
                                  if (!weekData) return <div className="w-40 border-r border-slate-200 dark:border-slate-800"></div>

                                  const percent = Math.min((weekData.worked / weekData.agreed) * 100, 100)
                                  const isOver = weekData.diff > 0
                                  const isUnder = weekData.diff < -10

                                  return (
                                    <div className="w-40 flex-shrink-0 flex items-center justify-center p-4 border-r border-slate-200 dark:border-slate-800 relative group/summary">
                                        {/* Progress Bar */}
                                        <div 
                                            className="h-6 w-full bg-slate-100 dark:bg-slate-800 rounded-md relative overflow-hidden cursor-pointer border border-slate-200 dark:border-slate-700"
                                            onClick={() => {
                                                if (isMonthLocked(weekData.weekStart)) {
                                                    alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
                                                    return
                                                }
                                                setWeeklyHoursModal({
                                                    isOpen: true,
                                                    employeeId: emp.id,
                                                    employeeName: emp.name,
                                                    weekStart: weekData.weekStart,
                                                    currentHours: weekData.agreed
                                                })
                                            }}
                                        >
                                            <div 
                                                className={cn(
                                                    "h-full transition-all duration-500",
                                                    isOver ? "bg-red-500" : isUnder ? "bg-orange-400" : "bg-blue-500"
                                                )}
                                                style={{ width: `${percent}%` }}
                                            />
                                            <div className={cn(
                                                "absolute inset-0 flex items-center justify-center text-xs font-medium z-10",
                                                percent > 50 ? "text-white drop-shadow-sm" : "text-slate-700 dark:text-slate-300"
                                            )}>
                                                {weekData.worked.toFixed(1)} / {weekData.agreed}h
                                            </div>
                                        </div>

                                        {/* Hover Tooltip */}
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-white dark:bg-slate-900 shadow-xl rounded-md border border-slate-200 dark:border-slate-800 p-3 z-50 invisible group-hover/summary:visible opacity-0 group-hover/summary:opacity-100 transition-all duration-200">
                                            <div className="text-xs space-y-2">
                                                <div className="font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-1 mb-1">
                                                    {t('summary') || 'Summary'}
                                                </div>
                                                
                                                {settings.visibleStats.weeklyTarget && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-500">{t('targetWeekly') || 'Weekly Target'}:</span>
                                                        <span className="font-medium text-blue-600 dark:text-blue-400">{weekData.agreed}h</span>
                                                    </div>
                                                )}
                                                
                                                {settings.visibleStats.weeklyDiff && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-500">{t('weekDiff') || 'Weekly Diff'}:</span>
                                                        <span className={cn("font-bold", weekData.diff < 0 ? "text-red-500" : "text-green-500")}>
                                                            {weekData.diff > 0 ? '+' : ''}{weekData.diff.toFixed(1)}
                                                        </span>
                                                    </div>
                                                )}
                                                
                                                {settings.visibleStats.monthlyDiff && (
                                                    <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800 mt-1">
                                                        <span className="text-slate-500">{t('monthDiff') || 'Monthly Diff'}:</span>
                                                        <span className={cn("font-bold", stats.diff < 0 ? "text-red-500" : "text-green-500")}>
                                                            {stats.diff > 0 ? '+' : ''}{stats.diff.toFixed(1)}
                                                        </span>
                                                    </div>
                                                )}
                                                
                                                <div className="text-[10px] text-slate-400 pt-2 text-center">
                                                    {t('clickToEditTarget') || 'Click bar to edit target'}
                                                </div>
                                            </div>
                                            {/* Arrow */}
                                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white dark:bg-slate-900 border-t border-l border-slate-200 dark:border-slate-800 transform rotate-45"></div>
                                        </div>
                                    </div>
                                  )
                              })()}

                              {/* Days Grid or Timeline */}
                              {view === 'day' ? (
                                 <ShiftTimelineContainer 
                                   emp={emp}
                                   shifts={getShiftsForCell(emp.id, currentDate)}
                                   hours={hours}
                                   startHour={startHour}
                                   totalViewHours={totalViewHours}
                                   onUpdateShift={handleUpdateShiftTimeline}
                                   onAddShift={() => openAddModal(emp.id, currentDate)}
                                   onEditShift={openEditModal}
                                   onContextMenu={handleContextMenu}
                                   isLocked={isMonthLocked(currentDate)}
                                 />
                              ) : view === 'month' ? (
                                 (() => {
                                     const stats = getEmployeeMonthStats(emp)
                                     return (
                                         <div className="flex-1 flex items-stretch">
                                           {stats.weeklyData.map((w, i) => (
                                               <div 
                                                key={i} 
                                                className={cn(
                                                    "w-24 flex-shrink-0 border-l border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-1 transition-colors group/cell relative",
                                                    isMonthLocked(w.weekStart) 
                                                       ? "cursor-not-allowed bg-slate-50/50 dark:bg-slate-900/20"
                                                       : "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                                )}
                                                onClick={() => {
                                                    if (isMonthLocked(w.weekStart)) {
                                                        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
                                                        return
                                                    }
                                                    setWeeklyHoursModal({
                                                        isOpen: true,
                                                        employeeId: emp.id,
                                                        employeeName: emp.name,
                                                        weekStart: w.weekStart,
                                                        currentHours: w.agreed
                                                    })
                                                }}
                                                title="Click to edit agreed hours"
                                            >
                                                {isMonthLocked(w.weekStart) && (
                                                    <div className="absolute top-0.5 right-0.5">
                                                        <Lock className="h-2 w-2 text-slate-300 dark:text-slate-600" />
                                                    </div>
                                                )}
                                                <div className="flex flex-col items-center gap-0.5">
                                                        <div className="flex items-baseline gap-1 text-xs">
                                                            <span className={cn("font-semibold", w.worked === 0 ? "text-slate-300 dark:text-slate-600" : "text-slate-700 dark:text-slate-300")}>
                                                                {w.worked.toFixed(1)}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400">/ {w.agreed.toFixed(1)}</span>
                                                        </div>
                                                        <div className={cn(
                                                            "text-[10px] font-medium px-1.5 rounded-full transition-opacity", 
                                                            w.diff === 0 ? "opacity-0 group-hover/cell:opacity-100 bg-slate-100 text-slate-400" : 
                                                            w.diff < 0 ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" : "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                                                        )}>
                                                            {w.diff > 0 ? '+' : ''}{w.diff.toFixed(1)}
                                                        </div>
                                                    </div>
                                               </div>
                                           ))}
                                           {settings.visibleStats.totalWorked && (
                                               <div className="w-28 flex-shrink-0 border-l border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-50/30 dark:bg-slate-900/20">
                                                   {stats.totalWorked.toFixed(1)}
                                               </div>
                                           )}
                                           {settings.visibleStats.monthlyTarget && (
                                               <div className="w-28 flex-shrink-0 border-l border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm text-slate-400 bg-slate-50/30 dark:bg-slate-900/20">
                                                   {stats.totalAgreed}
                                               </div>
                                           )}
                                           {settings.visibleStats.monthlyDiff && (
                                               <div className={cn("w-28 flex-shrink-0 border-l border-slate-200 dark:border-slate-800 flex items-center justify-center bg-slate-50/30 dark:bg-slate-900/20", stats.diff === 0 ? "text-slate-300" : "")}>
                                                   <span className={cn(
                                                       "text-xs font-bold px-2 py-0.5 rounded-full",
                                                       stats.diff < 0 ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" : 
                                                       stats.diff > 0 ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : ""
                                                   )}>
                                                       {stats.diff > 0 ? '+' : ''}{stats.diff.toFixed(1)}
                                                   </span>
                                               </div>
                                           )}
                                           {settings.visibleStats.lifetimeBalance && (
                                               <div className={cn("w-32 flex-shrink-0 border-l border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm font-bold bg-slate-100/50 dark:bg-slate-800/30 shadow-[inset_0_0_10px_rgba(0,0,0,0.02)]", stats.lifetimeBalance < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400")}>
                                                   {stats.lifetimeBalance > 0 ? '+' : ''}{stats.lifetimeBalance.toFixed(1)}
                                               </div>
                                           )}
                                       </div>
                                    )
                                 })()
                              ) : (
                                  days.map(day => {
                                    const dayShifts = getShiftsForCell(emp.id, day)
                                    const locked = isMonthLocked(day)
                                    return (
                                      <div 
                                        key={day.toISOString()} 
                                        className={cn(
                                            "flex-1 border-l border-slate-200 dark:border-slate-800 min-h-[80px] p-1 relative group", 
                                            isSameDay(day, new Date()) && "bg-blue-50/20 dark:bg-blue-500/5",
                                            locked && !isSameDay(day, new Date()) && "bg-slate-50/50 dark:bg-slate-900/20"
                                        )}
                                        onClick={() => openAddModal(emp.id, day)}
                                      >
                                        <div className="h-full w-full flex flex-col gap-1 cursor-pointer">
                                          {dayShifts.map(shift => (
                                            <div
                                                key={shift.id}
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  openEditModal(shift)
                                                }}
                                                onContextMenu={(e) => handleContextMenu(e, shift)}
                                                className="bg-blue-100 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30 rounded px-2 py-1 text-xs text-blue-700 dark:text-blue-300 hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors"
                                            >
                                              {format(parseISO(shift.startTime), 'HH:mm')} - {format(parseISO(shift.endTime), 'HH:mm')}
                                            </div>
                                          ))}
                                          {/* Hover Add Button */}
                                          {!locked && (
                                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                                            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex-none flex items-center justify-center shadow-sm aspect-square">
                                              <Plus className="h-3 w-3" />
                                            </div>
                                          </div>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })
                               )}
                             </div>
                           )}
                         </Draggable>
                       ))}
                       {provided.placeholder}
                     </div>
                   )}
                 </Droppable>
               </div>
             ))}
           </DragDropContext>
          
          {view === 'month' && settings.showCalendar && (
             <div className="mt-16 px-1">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                        {t('calendar') || 'Calendar'} <span className="text-slate-400 dark:text-slate-600 font-light">|</span> {format(currentDate, 'MMMM yyyy', { locale: dateLocale })}
                    </h3>
                </div>
                
                <div className="bg-slate-200 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
                    {/* Weekday Headers */}
                    <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(dayName => (
                            <div key={dayName} className="py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {dayName}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800">
                        {calendarDays.map((day, i) => {
                          const dayShifts = shifts.filter((s) => isSameDay(parseISO(s.startTime), day))
                          const isToday = isSameDay(day, new Date())
                          const isCurrentMonth = day.getMonth() === currentDate.getMonth()
                          const isLocked = isMonthLocked(day)
                          
                          return (
                            <div
                              key={day.toISOString()}
                              className={cn(
                                  'min-h-[120px] p-2 transition-colors relative group bg-white dark:bg-slate-900',
                                  !isCurrentMonth && 'bg-slate-50/50 dark:bg-slate-900/50 opacity-60',
                                  isLocked && 'bg-slate-50 dark:bg-slate-900/50'
                              )}
                              onClick={() => !isLocked && openAddModal(0, day)}
                            >
                              {isLocked && (
                                <div className="absolute top-1 right-1 z-10">
                                    <Lock className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                                </div>
                              )}
                              <div className="flex justify-between items-start mb-2">
                                  <span className={cn(
                                      "text-xs font-semibold px-2 py-0.5 rounded-full",
                                      isToday 
                                        ? "bg-blue-600 text-white" 
                                        : isCurrentMonth 
                                            ? "text-slate-700 dark:text-slate-300" 
                                            : "text-slate-400"
                                  )}>
                                      {format(day, 'd')}
                                  </span>
                                  {!isLocked && (
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button className="text-blue-600 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30">
                                          <Plus className="h-3 w-3" />
                                      </button>
                                  </div>
                                  )}
                              </div>
                              <div className="space-y-1 overflow-y-auto max-h-[100px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                                  {dayShifts.map(shift => {
                                      const emp = employees.find(e => e.id === shift.employeeId)
                                      if (!emp) return null
                                      return (
                                          <div key={shift.id} 
                                               className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800 rounded px-1.5 py-0.5 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 transition-colors flex items-center gap-1.5 shadow-sm"
                                               onClick={(e) => {
                                                   e.stopPropagation()
                                                   openEditModal(shift)
                                               }}
                                               onContextMenu={(e) => handleContextMenu(e, shift)}
                                               title={`${emp.name}: ${format(parseISO(shift.startTime), 'HH:mm')} - ${format(parseISO(shift.endTime), 'HH:mm')}`}
                                          >
                                              <div className="w-1 h-1 rounded-full bg-blue-400 dark:bg-blue-500 shrink-0" />
                                              <span className="font-semibold truncate max-w-[60px]">{emp.name}</span>
                                              <span className="opacity-75 text-[9px]">{format(parseISO(shift.startTime), 'HH:mm')}</span>
                                          </div>
                                      )
                                  })}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                </div>
             </div>
          )}
        </div>
        )}
      </div>

      {/* Print Modal */}
      {printModalState.isOpen && printModalState.employee && (
        <PrintWeekModal
            isOpen={printModalState.isOpen}
            onClose={() => setPrintModalState({ isOpen: false, employee: null })}
            employee={printModalState.employee}
            weekDays={days}
            shifts={shifts.filter(s => s.employeeId === printModalState.employee!.id)}
        />
      )}

      {isPrintWeeklyModalOpen && (
        <PrintWeeklyScheduleModal
            isOpen={isPrintWeeklyModalOpen}
            onClose={() => setIsPrintWeeklyModalOpen(false)}
            currentDate={currentDate}
            employees={employees}
            shifts={shifts}
        />
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingShift ? t('editShift') : t('addShift')}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveShift} className="space-y-4">
              {/* Type Toggle */}
              <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
                <button
                    type="button"
                    className={cn(
                        "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                        formData.type === 'work' 
                            ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" 
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                    onClick={() => setFormData({ ...formData, type: 'work' })}
                >
                    {t('work') || 'Work'}
                </button>
                <button
                    type="button"
                    className={cn(
                        "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                        formData.type === 'absence' 
                            ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm" 
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                    onClick={() => setFormData({ ...formData, type: 'absence' })}
                >
                    {t('absence') || 'Absence'}
                </button>
              </div>

              {!editingShift && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t('employee') || 'Employee'}
                    </label>
                    <select
                      className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                      value={formData.employeeId}
                      onChange={(e) => setFormData({ ...formData, employeeId: Number(e.target.value) })}
                      required
                    >
                      <option value={0} disabled>{t('selectEmployee') || 'Select Employee'}</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {formData.type === 'absence' ? (t('startDate') || 'Start Date') : t('date')}
                </label>
                <input
                  type="date"
                  required
                  className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>

              {formData.type === 'absence' ? (
                  <>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {t('absenceType') || 'Absence Type'}
                        </label>
                        <select
                            className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                            value={formData.absenceType}
                            onChange={(e) => {
                                const newType = e.target.value as any;
                                setFormData({ 
                                    ...formData, 
                                    absenceType: newType,
                                    isPaid: newType !== 'unpaid'
                                })
                            }}
                            required
                        >
                            <option value="holiday">{t('holiday') || 'Holiday (Vacaciones)'}</option>
                            <option value="bank_holiday">{t('bankHoliday') || 'Bank Holiday (Festivo)'}</option>
                            <option value="sick_leave">{t('sickLeave') || 'Sick Leave (Baja)'}</option>
                            <option value="unpaid">{t('unpaid') || 'Unpaid (Permiso no retribuido)'}</option>
                            <option value="other">{t('other') || 'Other'}</option>
                        </select>
                    </div>
                    
                    {!editingShift && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {t('numberOfDays') || 'Number of Days'}
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="30"
                                required
                                className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                                value={formData.days}
                                onChange={(e) => setFormData({ ...formData, days: parseInt(e.target.value) || 1 })}
                            />
                            <p className="text-xs text-slate-500">
                                {t('daysToHoursNote') || 'Creates daily entries based on weekly average.'}
                            </p>
                        </div>
                    )}

                    <div className="flex items-center space-x-2 pt-2">
                        <input
                            type="checkbox"
                            id="isPaid"
                            checked={formData.isPaid}
                            onChange={(e) => setFormData({ ...formData, isPaid: e.target.checked })}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="isPaid" className="text-sm text-slate-700 dark:text-slate-300">
                            {t('isPaid') || 'Paid Absence'}
                        </label>
                    </div>
                  </>
              ) : (
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
              )}
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
            {editingShift && (
              <button
                type="button"
                onClick={handleDeleteShift}
                className="flex-1 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 hover:text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                {t('delete')}
              </button>
            )}
            <button
              type="submit"
              disabled={!!overlapError}
              className={cn(
                "flex-1 rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900",
                overlapError 
                    ? "bg-slate-400 cursor-not-allowed" 
                    : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )}
  
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
                        {weeklyHoursModal.employeeName} - {t('weekOf') || 'Week of'} {format(weeklyHoursModal.weekStart, 'MMM d')}
                    </p>
                </div>
                <form onSubmit={async (e) => {
                    e.preventDefault()
                    if (isMonthLocked(weeklyHoursModal.weekStart)) {
                        alert(t('monthClosedMessage') || "This month is closed. Unlock it to make changes.")
                        return
                    }
                    const formData = new FormData(e.currentTarget)
                    const hours = parseFloat(formData.get('hours') as string)
                    if (!isNaN(hours)) {
                        try {
                            const weekStr = weeklyHoursModal.weekStart.toISOString()
                            await window.api.employees.setWeeklyHours(weeklyHoursModal.employeeId, weekStr, hours)
                            setWeeklyHoursOverrides(prev => ({
                                ...prev,
                                [weekStr]: {
                                    ...(prev[weekStr] || {}),
                                    [weeklyHoursModal.employeeId]: hours
                                }
                            }))
                            setWeeklyHoursModal(prev => ({ ...prev, isOpen: false }))
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

  <CopyShiftsModal
        isOpen={isCopyModalOpen}
        onClose={() => setIsCopyModalOpen(false)}
        sourceDate={currentDate}
        view={view}
        onSuccess={fetchData}
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

  {/* Context Menu */}
      {contextMenu && (
        <ShiftContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={() => openEditModal(contextMenu.shift)}
          onDelete={() => handleDeleteShiftDirectly(contextMenu.shift)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
