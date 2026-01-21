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
  differenceInDays
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
  Calendar,
  GripVertical,
  AlertTriangle,
  Printer
} from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import ShiftContextMenu from './ShiftContextMenu'
import { Employee, Shift } from '../types'
import { cn } from '@renderer/lib/utils'
import ShiftTimelineItem from './ShiftTimelineItem'
import ConfirmModal from './ConfirmModal'
import { DatePicker } from './DatePicker'
import PrintWeekModal from './PrintWeekModal'

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
  onContextMenu
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
       <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 pointer-events-none">
          <div className="bg-blue-600 text-white rounded-full p-1 shadow-sm">
             <Plus className="h-3 w-3" />
          </div>
       </div>
    </div>
  )
}

export default function Shifts(): React.JSX.Element {
  const { t, settings } = useSettings()
  const dateLocale = settings.language === 'es' ? es : undefined
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'week' | 'day' | 'month'>('week')
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [loading, setLoading] = useState(true)
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
    endTime: ''
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

  const fetchData = async (): Promise<void> => {
    setLoading(true)
    try {
      const [emps, allShifts] = await Promise.all([
        window.api.employees.getAll(),
        window.api.shifts.getAll() // We fetch all shifts for now, or we could filter by date range
      ])
      
      // Filter shifts for current view to optimize rendering if needed, 
      // but simpler to fetch all or fetch range. 
      // Let's refine fetch range:
      let startStr, endStr
      if (view === 'week') {
        const start = startOfWeek(currentDate, { weekStartsOn: 1 })
        const end = endOfWeek(currentDate, { weekStartsOn: 1 })
        startStr = start.toISOString()
        endStr = end.toISOString()
      } else if (view === 'month') {
        // For month view, we need ALL shifts to calculate lifetime balance accurately
        // So we leave startStr/endStr undefined to fetch everything
        startStr = undefined
        endStr = undefined
      } else {
        startStr = startOfDay(currentDate).toISOString()
        endStr = endOfDay(currentDate).toISOString()
      }

      // Re-fetch shifts with range
      const rangeShifts = await window.api.shifts.getAll(startStr, endStr)
      
      setEmployees(emps as Employee[])
      setShifts(rangeShifts as Shift[])
    } catch (error) {
      console.error('Failed to fetch data:', error)
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
    
    // Insert at new index
    destEmployees.splice(destination.index, 0, movedEmp)

    // Reassign orders
    const updates: Promise<void>[] = []
    destEmployees.forEach((emp, index) => {
      emp.displayOrder = index
      updates.push(window.api.employees.updateOrder(emp.id, index))
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

    const startDateTime = new Date(`${formData.date}T${formData.startTime}`)
    let endDateTime = new Date(`${formData.date}T${formData.endTime}`)

    // Handle cross-day shifts: if end time < start time, assume it ends the next day
    if (endDateTime < startDateTime) {
        endDateTime = addDays(endDateTime, 1)
    }

    try {
        if (editingShift) {
            await window.api.shifts.update(editingShift.id, {
                employeeId: formData.employeeId,
                startTime: startDateTime.toISOString(),
                endTime: endDateTime.toISOString()
            })
        } else {
            await window.api.shifts.add({
                employeeId: formData.employeeId,
                startTime: startDateTime.toISOString(),
                endTime: endDateTime.toISOString()
            })
        }
        handleCloseModal()
        fetchData()
    } catch (error) {
        console.error('Failed to save shift:', error)
    }
  }

  const handleDeleteShift = async (): Promise<void> => {
    if (!editingShift) return
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

  const openAddModal = (employeeId: number, date: Date): void => {
    setEditingShift(null)
    setFormData({
      employeeId,
      date: format(date, 'yyyy-MM-dd'),
      startTime: settings.openingTime,
      endTime: settings.closingTime
    })
    setIsModalOpen(true)
  }

  const openEditModal = (shift: Shift): void => {
    setEditingShift(shift)
    const start = parseISO(shift.startTime)
    const end = parseISO(shift.endTime)
    setFormData({
      employeeId: shift.employeeId,
      date: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm')
    })
    setIsModalOpen(true)
  }

  const handleUpdateShiftTimeline = async (id: number, startTime: string, endTime: string) => {
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
      fetchData() // Revert visually until confirmed
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

  // Calculate stats for Month View
  const getEmployeeMonthStats = (emp: Employee) => {
    // 1. Weekly breakdown
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 })
    
    const weeklyHours = weeks.map(weekStart => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
        // Clip week to month boundaries for accurate "this month" reporting?
        // Usually weekly hours are just for the week. But if the week spans months, 
        // user might want full week or just the part in this month. 
        // "Total hours each eE has done per week" -> usually full week.
        
        const weekShifts = shifts.filter(s => 
            s.employeeId === emp.id && 
            parseISO(s.startTime) >= weekStart && 
            parseISO(s.endTime) <= endOfDay(weekEnd)
        )
        return weekShifts.reduce((acc, s) => acc + getShiftDuration(s), 0)
    })

    // 2. Total Worked (This Month)
    const monthShifts = shifts.filter(s => 
        s.employeeId === emp.id && 
        parseISO(s.startTime) >= monthStart && 
        parseISO(s.endTime) <= endOfDay(monthEnd)
    )
    const totalWorked = monthShifts.reduce((acc, s) => acc + getShiftDuration(s), 0)

    // 3. Agreed Hours (Monthly)
    const agreed = emp.defaultHours || 160 // Default to 160 if not set

    // 4. Difference (This Month)
    const diff = totalWorked - agreed

    // 5. Total Owed (Lifetime Balance)
    // Formula: Sum(All Shift Durations) - (Months Active * Agreed Monthly Hours)
    // We need to estimate "Months Active". 
    // Heuristic: From first shift date to NOW.
    const empShifts = shifts.filter(s => s.employeeId === emp.id)
    let lifetimeBalance = 0
    
    if (empShifts.length > 0) {
        // Find earliest shift
        const sortedShifts = [...empShifts].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        const firstShiftDate = parseISO(sortedShifts[0].startTime)
        const targetDate = endOfMonth(currentDate)
        
        // Calculate full months elapsed since first shift up to the target month
        const monthsDiff = differenceInMonths(targetDate, startOfMonth(firstShiftDate)) + 1
        
        // Filter shifts up to the target date
        const relevantShifts = empShifts.filter(s => parseISO(s.startTime) <= targetDate)
        
        const totalLifetimeWorked = relevantShifts.reduce((acc, s) => acc + getShiftDuration(s), 0)
        const totalLifetimeAgreed = monthsDiff * agreed
        
        lifetimeBalance = totalLifetimeWorked - totalLifetimeAgreed
    }

    return { weeklyHours, totalWorked, agreed, diff, lifetimeBalance, weeks }
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
                className="text-sm font-medium min-w-[140px] text-center capitalize hover:bg-slate-100 dark:hover:bg-slate-800 rounded px-2 py-1 transition-colors"
              >
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
            <option value="all">{t('allDepartments')}</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Shifts Grid */}
      <div className="flex-1 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <div className="min-w-[1000px]">
           {/* Grid Header */}
           <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <div className="w-8 flex-shrink-0 border-r border-slate-200 dark:border-slate-800"></div>
            <div className="w-48 flex-shrink-0 p-4 font-medium text-slate-500 dark:text-slate-400">
              {t('employee')}
            </div>
            
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
                        <div key={weekStart.toISOString()} className="w-24 p-4 font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 text-center">
                            {t('week')} {i + 1}
                        </div>
                    ))}
                    <div className="w-32 p-4 font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 text-center">{t('total')}</div>
                    <div className="w-32 p-4 font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 text-center">{t('agreed')}</div>
                    <div className="w-32 p-4 font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 text-center">{t('diff')}</div>
                    <div className="w-32 p-4 font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 text-center">{t('owed')}</div>
                </div>
            ) : (
                days.map(day => (
                  <div key={day.toISOString()} className={cn("flex-1 p-4 text-center border-l border-slate-200 dark:border-slate-800", isSameDay(day, new Date()) && "bg-blue-50/50 dark:bg-blue-500/5")}>
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
                                "flex border-b border-slate-200 dark:border-slate-800 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/30",
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
                                       className="font-medium text-slate-900 dark:text-slate-200 cursor-pointer hover:underline select-none truncate w-32"
                                       onDoubleClick={() => navigate(`/employees/${emp.id}`)}
                                       title={emp.name}
                                    >
                                       {emp.name}
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
                                 />
                              ) : view === 'month' ? (
                                 (() => {
                                     const stats = getEmployeeMonthStats(emp)
                                     return (
                                        <div className="flex-1 flex h-full items-stretch">
                                            {stats.weeklyHours.map((h, i) => (
                                                <div key={i} className="w-24 border-l border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm">
                                                    {h.toFixed(1)}
                                                </div>
                                            ))}
                                            <div className="w-32 border-l border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm font-medium">
                                                {stats.totalWorked.toFixed(1)}
                                            </div>
                                            <div className="w-32 border-l border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm text-slate-500">
                                                {stats.agreed}
                                            </div>
                                            <div className={cn("w-32 border-l border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm font-medium", stats.diff < 0 ? "text-red-500" : "text-green-500")}>
                                                {stats.diff > 0 ? '+' : ''}{stats.diff.toFixed(1)}
                                            </div>
                                            <div className={cn("w-32 border-l border-slate-200 dark:border-slate-800 flex items-center justify-center text-sm font-bold", stats.lifetimeBalance < 0 ? "text-red-600" : "text-green-600")}>
                                                {stats.lifetimeBalance > 0 ? '+' : ''}{stats.lifetimeBalance.toFixed(1)}
                                            </div>
                                        </div>
                                    )
                                 })()
                              ) : (
                                  days.map(day => {
                                    const dayShifts = getShiftsForCell(emp.id, day)
                                    return (
                                      <div 
                                        key={day.toISOString()} 
                                        className={cn("flex-1 border-l border-slate-200 dark:border-slate-800 min-h-[80px] p-1 relative group", isSameDay(day, new Date()) && "bg-blue-50/20 dark:bg-blue-500/5")}
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
                                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                                            <div className="bg-blue-600 text-white rounded-full p-1 shadow-sm">
                                              <Plus className="h-3 w-3" />
                                            </div>
                                          </div>
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
        </div>
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
