import { useEffect, useState, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from './ui/table'
import { cn } from '@renderer/lib/utils'
import { format, startOfDay, endOfDay, parseISO, isSameDay, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { useSettings } from '../hooks/useSettings'
import ShiftTimelineItem from './ShiftTimelineItem'
import ShiftContextMenu from './ShiftContextMenu'
import ConfirmModal from './ConfirmModal'
import {
  X,
  Save,
  Trash2,
  Users,
  Calendar,
  Clock,
  Briefcase,
  AlertCircle,
  TrendingUp,
  AlertTriangle
} from 'lucide-react'
import { Employee, Shift } from '@renderer/types'

function DashboardEmployeeRow({ 
  emp, 
  shifts, 
  hours, 
  startHour, 
  totalViewHours, 
  onUpdateShift,
  onEditShift,
  onContextMenu
}: { 
  emp: Employee, 
  shifts: Shift[], 
  hours: number[], 
  startHour: number, 
  totalViewHours: number,
  onUpdateShift: (id: number, start: string, end: string) => Promise<void> | void
  onEditShift: (shift: Shift) => void
  onContextMenu: (e: React.MouseEvent, shift: Shift) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  return (
    <div
      className="flex items-center h-10 group hover:bg-slate-800/30 rounded px-1 transition-colors"
    >
      <div 
        className="w-[150px] text-sm font-medium text-slate-300 truncate pr-2 flex-shrink-0 cursor-pointer select-none"
        onDoubleClick={() => navigate(`/employees/${emp.id}`)}
      >
        {emp.name}
      </div>
      <div 
        ref={containerRef}
        className="flex-1 relative h-8 bg-slate-950/50 rounded overflow-hidden"
      >
        {/* Grid lines */}
        <div className="absolute inset-0 flex pointer-events-none">
          {hours.map((hour) => (
            <div key={hour} className="flex-1 border-l border-slate-800/30"></div>
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
          />
        ))}
      </div>
    </div>
  )
}

function Dashboard(): React.JSX.Element {
  const { t, settings } = useSettings()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [todayShifts, setTodayShifts] = useState<Shift[]>([])
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, shift: Shift } | null>(null)
  const [formData, setFormData] = useState({
    employeeId: 0,
    date: '',
    startTime: '',
    endTime: ''
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
  }, [formData, isModalOpen, editingShift, settings])

  const fetchData = async (): Promise<void> => {
    try {
      const [empData, shiftsData] = await Promise.all([
        window.api.employees.getAll(),
        window.api.shifts.getAll(
          startOfDay(new Date()).toISOString(),
          endOfDay(new Date()).toISOString()
        )
      ])
      setEmployees(empData as Employee[])
      setTodayShifts(shiftsData as Shift[])
    } catch (error) {
      console.error('Failed to fetch data:', error)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const parseHour = (timeStr: string, defaultHour: number): number => {
    if (!timeStr) return defaultHour
    const h = parseInt(timeStr.split(':')[0])
    return isNaN(h) ? defaultHour : h
  }

  const startHour = parseHour(settings.openingTime, 8)
  const endHour = parseHour(settings.closingTime, 20)
  // Ensure we have at least 1 hour and end is after start
  const safeEndHour = endHour <= startHour ? endHour + 24 : endHour
  const totalViewHours = safeEndHour - startHour
  const hours = Array.from({ length: totalViewHours }, (_, i) => startHour + i)

  const dateLocale = settings.language === 'es' ? es : undefined

  const getStatusLabel = (status: string): string => {
    if (status === 'Active') return t('statusActive')
    if (status === 'Inactive') return t('statusInactive')
    if (status === 'On Leave') return t('statusOnLeave')
    return status
  }

  const handleUpdateShift = async (id: number, startTime: string, endTime: string) => {
    // Validate business hours
    const start = parseISO(startTime)
    const end = parseISO(endTime)
    
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
      fetchData() // Revert visual state
      return
    }

    await proceedUpdate(id, startTime, endTime)
  }

  const proceedUpdate = async (id: number, startTime: string, endTime: string) => {
    const start = parseISO(startTime)
    const end = parseISO(endTime)
    const currentShift = todayShifts.find(s => s.id === id)
    if (!currentShift) return

    try {
        // Robust overlap check
        const rangeStart = startOfDay(start).toISOString()
        const rangeEnd = endOfDay(end).toISOString()
        const fetchedShifts = await window.api.shifts.get(currentShift.employeeId, rangeStart, rangeEnd) as Shift[]
        
        const hasOverlap = fetchedShifts.some(s => {
            if (s.id === id) return false
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

        await window.api.shifts.update(id, { 
            employeeId: currentShift.employeeId,
            startTime, 
            endTime 
        })
        fetchData()
    } catch (err) {
      console.error("Failed to update shift", err)
      fetchData()
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setOverlapError(null)
    setBusinessHourWarning(null)
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

  const handleSaveShift = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (overlapError) return

    const startDateTime = new Date(`${formData.date}T${formData.startTime}`)
    let endDateTime = new Date(`${formData.date}T${formData.endTime}`)

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

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">{t('dashboard')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('dashboardOverview')}</p>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-slate-300 capitalize">
            {format(new Date(), settings.language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM do', { locale: dateLocale })}
          </div>
          <div className="text-xs text-slate-500">{t('shiftsToday')}</div>
        </div>
      </header>

      {/* Timeline View */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          {t('todaysCoverage')}
        </h2>

        <div className="rounded-md border border-slate-800 bg-slate-900/50 p-4 overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Time Header */}
            <div className="flex mb-2 ml-[150px] pr-2 relative">
              {hours.map((hour) => (
                <div key={hour} className="flex-1 text-left pl-1 text-[10px] text-slate-400 border-l border-slate-800/50 h-4">
                  {String(hour % 24).padStart(2, '0')}:00
                </div>
              ))}
              {/* Final Hour Label */}
              <div className="absolute right-0 top-0 text-[10px] text-slate-400 translate-x-1/2">
                  {String(safeEndHour % 24).padStart(2, '0')}:00
              </div>
            </div>

            {/* Employee Rows */}
            <div className="space-y-2">
              {employees
                .filter((e) => e.status === 'Active')
                .map((emp) => (
                  <DashboardEmployeeRow
                    key={emp.id}
                    emp={emp}
                    shifts={todayShifts.filter((s) => s.employeeId === emp.id)}
                    hours={hours}
                    startHour={startHour}
                    totalViewHours={totalViewHours}
                    onUpdateShift={handleUpdateShift}
                    onEditShift={openEditModal}
                    onContextMenu={handleContextMenu}
                  />
                ))}

              {employees.filter((e) => e.status === 'Active').length === 0 && (
                <div className="text-center text-sm text-slate-500 py-4">
                  {t('noActiveEmployees')}
                </div>
              )}
            </div>

            {/* Coverage Summary */}
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center h-4 ml-[150px] relative pr-2">
                {hours.map((hour) => {
                  const isCovered = todayShifts.some((s) => {
                    const start = parseISO(s.startTime)
                    const end = parseISO(s.endTime)
                    const shiftStartHour = start.getHours()
                    const shiftEndHour = end.getHours() + (end.getMinutes() > 0 ? 1 : 0)
                    return hour >= shiftStartHour && hour < shiftEndHour
                  })

                  return (
                    <div
                      key={hour}
                      className={cn(
                        'flex-1 h-full first:rounded-l last:rounded-r',
                        isCovered ? 'bg-emerald-500/20' : 'bg-red-500/10'
                      )}
                      title={isCovered ? t('covered') : t('noCoverage')}
                    ></div>
                  )
                })}
              </div>
              <div className="ml-[150px] mt-1 flex justify-between text-[10px] text-slate-500">
                <span>{t('coverageGapsRed')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Directory Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            {t('employees')}
          </h2>
          <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">
            {employees.length} {t('totalEmployees')}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('role')}</TableHead>
              <TableHead>{t('department')}</TableHead>
              <TableHead className="text-right">{t('status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                  {t('noActiveEmployees')}
                </TableCell>
              </TableRow>
            ) : (
              employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="w-[60px] text-slate-400">
                    #{employee.id.toString().padStart(3, '0')}
                  </TableCell>
                  <TableCell className="font-medium">{employee.name}</TableCell>
                  <TableCell>{employee.role}</TableCell>
                  <TableCell className="text-slate-300">{employee.department}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        employee.status === 'Active'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : employee.status === 'Inactive'
                            ? 'bg-slate-700 text-slate-400'
                            : 'bg-amber-500/10 text-amber-300'
                      )}
                    >
                      {getStatusLabel(employee.status)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {/* Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-50">{t('editShift')}</h2>
              <button
                onClick={handleCloseModal}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveShift} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400">
                    {t('startTime')}
                  </label>
                  <input
                    type="time"
                    required
                    className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400">
                    {t('endTime')}
                  </label>
                  <input
                    type="time"
                    required
                    className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
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

              <div className="flex items-center justify-between pt-4 border-t border-slate-800 mt-6">
                <button
                  type="button"
                  onClick={handleDeleteShift}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  {t('delete')}
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={!!overlapError}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors",
                      overlapError 
                          ? "bg-slate-700 cursor-not-allowed text-slate-400" 
                          : "bg-blue-600 hover:bg-blue-500"
                    )}
                  >
                    <Save className="h-4 w-4" />
                    {t('save')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
      
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        type={confirmState.type}
        confirmText={t('confirm')}
        cancelText={t('cancel')}
      />
    </div>
  )
}

export default Dashboard
