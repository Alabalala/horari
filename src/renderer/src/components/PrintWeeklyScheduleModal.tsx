import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addDays,
  isSameDay,
  parseISO,
  startOfDay,
  endOfDay
} from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Printer, Download, FileType, ChevronDown } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { Employee, Shift } from '../types'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { cn } from '@renderer/lib/utils'

interface PrintWeeklyScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  currentDate: Date
  employees: Employee[]
  shifts: Shift[]
}

export default function PrintWeeklyScheduleModal({
  isOpen,
  onClose,
  currentDate,
  employees,
  shifts
}: PrintWeeklyScheduleModalProps): React.JSX.Element | null {
  const { t, settings } = useSettings()
  const [selectedDepartment, setSelectedDepartment] = useState('all')
  const [isGenerating, setIsGenerating] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const daysRef = useRef<(HTMLDivElement | null)[]>([])

  if (!isOpen) return null

  const dateLocale = settings.language === 'es' ? es : undefined
  
  // Get week days
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // Filter employees
  const filteredEmployees = employees.filter(emp => 
    selectedDepartment === 'all' || emp.department === selectedDepartment
  )

  // Get unique departments
  const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)))

  // Business Hours Logic (copied from Shifts.tsx to match)
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

  // Helper to check if a shift is in a specific day and employee
  const getShiftsForDayAndEmployee = (day: Date, empId: number) => {
    return shifts.filter(s => {
      if (s.employeeId !== empId) return false
      const shiftStart = parseISO(s.startTime)
      // Check if shift starts on this day OR overlaps into this day (if it started previous day)
      // For simplicity in daily view, we usually check if it intersects the day's range
      // But based on current app logic, shifts are split or handled. 
      // Let's assume shifts are stored with full ISO strings.
      // We want to show shifts that are active on this day.
      
      const sStart = parseISO(s.startTime)
      const sEnd = parseISO(s.endTime)
      const dayStart = startOfDay(day)
      const dayEnd = endOfDay(day)

      return (sStart <= dayEnd && sEnd >= dayStart)
    })
  }

  // Helper to calculate staff count per hour
  const getStaffCount = (day: Date, hour: number) => {
    let count = 0
    
    // We only care about filtered employees for the count? Or all?
    // Usually "coverage" implies available staff, so filtered employees seems correct for the view.
    
    filteredEmployees.forEach(emp => {
      const empShifts = getShiftsForDayAndEmployee(day, emp.id)
      const hasShift = empShifts.some(s => {
        const sStart = parseISO(s.startTime)
        const sEnd = parseISO(s.endTime)
        
        // Normalize times to hours for comparison
        let sStartH = sStart.getHours() + sStart.getMinutes() / 60
        let sEndH = sEnd.getHours() + sEnd.getMinutes() / 60
        
        // Handle cross-day logic for visualization
        if (!isSameDay(sStart, sEnd)) {
           // If shift starts previous day, start time is effectively 0 for today (or startHour)
           // If shift ends next day, end time is effectively 24 for today
           if (sStart < startOfDay(day)) sStartH = 0 // Started before today
           if (sEnd > endOfDay(day)) sEndH = 24 // Ends after today
        } else {
            // Same day shift, but we need to match the day being rendered
            if (!isSameDay(sStart, day)) return false // Should be caught by getShiftsForDayAndEmployee
        }
        
        // Check overlap with hour slot [hour, hour+1)
        return sStartH < (hour + 1) && sEndH > hour
      })
      if (hasShift) count++
    })
    return count
  }

  const handleExport = async () => {
    if (!printRef.current) return
    setIsGenerating(true)

    try {
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: 'a4' // We will adjust per page or scale
        })

        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = pdf.internal.pageSize.getHeight()

        for (let i = 0; i < weekDays.length; i++) {
            const dayElement = daysRef.current[i]
            if (!dayElement) continue

            const canvas = await html2canvas(dayElement, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: true
            })

            const imgData = canvas.toDataURL('image/png')
            
            // Calculate dimensions to fit width
            const imgWidth = pdfWidth
            const imgHeight = (canvas.height * pdfWidth) / canvas.width

            if (i > 0) pdf.addPage()
            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
        }

        const filename = `${t('schedule') || 'schedule'}-${format(weekStart, 'yyyy-MM-dd')}-week.pdf`
        
        // Use Electron API to save and open
        if ((window as any).api && (window as any).api.utils && (window as any).api.utils.saveExport) {
            const pdfOutput = pdf.output('datauristring')
            await (window as any).api.utils.saveExport(pdfOutput, filename)
        } else {
            pdf.save(filename)
        }

    } catch (err) {
        console.error('Export failed:', err)
    } finally {
        setIsGenerating(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {t('exportSchedule') || 'Export Weekly Schedule'}
            </h2>
            <p className="text-sm text-slate-500">
              {format(weekStart, 'PPP', { locale: dateLocale })} - {format(weekEnd, 'PPP', { locale: dateLocale })}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Department Filter */}
            <div className="relative">
                <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="pl-3 pr-8 py-2 bg-slate-100 border-none rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer outline-none"
                >
                    <option value="all">{t('allDepartments') || 'All Departments'}</option>
                    {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            </div>

            <button
              onClick={handleExport}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isGenerating ? (
                <span className="animate-spin">⌛</span>
              ) : (
                <Printer className="h-4 w-4" />
              )}
              {t('print') || 'Print / PDF'}
            </button>
            
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-auto bg-slate-100 p-8" ref={printRef}>
          <div className="flex flex-col gap-8">
             {weekDays.map((day, index) => (
                 <div 
                    key={day.toISOString()} 
                    ref={el => daysRef.current[index] = el}
                    className="bg-white p-6 rounded-lg shadow-sm border border-slate-200"
                 >
                    {/* Day Header */}
                    <div className="flex items-center justify-between mb-4 border-b pb-2">
                         <div className="flex items-center gap-4">
                            {settings.companyLogo && (
                                <img src={settings.companyLogo} alt="Logo" className="h-8 w-auto object-contain" />
                            )}
                            <h3 className="text-lg font-bold text-slate-900 capitalize">
                                {format(day, 'EEEE d', { locale: dateLocale })}
                            </h3>
                         </div>
                         <div className="text-sm text-slate-500">
                            {settings.companyName}
                         </div>
                    </div>

                    {/* Timeline Grid */}
                    <div className="relative">
                        {/* Time Header */}
                        <div className="flex border-b border-slate-200 mb-2">
                            <div className="w-48 flex-shrink-0"></div> {/* Spacer for names */}
                            <div className="flex-1 flex">
                                {hours.map(hour => (
                                    <div key={hour} className="flex-1 text-center text-xs font-semibold text-slate-500 border-l border-slate-100 py-1">
                                        {hour}:00
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Employees Rows */}
                        <div className="space-y-1">
                            {filteredEmployees.map(emp => {
                                const dayShifts = getShiftsForDayAndEmployee(day, emp.id)
                                return (
                                    <div key={emp.id} className="flex h-8 items-center group">
                                        <div className="w-48 flex-shrink-0 pr-4 text-sm font-medium text-slate-700 truncate">
                                            {emp.name}
                                        </div>
                                        <div className="flex-1 relative h-6 bg-slate-50 rounded border border-slate-100">
                                            {/* Grid Lines */}
                                            <div className="absolute inset-0 flex pointer-events-none">
                                                {hours.map(hour => (
                                                    <div key={hour} className="flex-1 border-l border-slate-100"></div>
                                                ))}
                                            </div>

                                            {/* Shifts */}
                                            {dayShifts.map(shift => {
                                                const sStart = parseISO(shift.startTime)
                                                const sEnd = parseISO(shift.endTime)
                                                
                                                // Calculate position
                                                let startH = sStart.getHours() + sStart.getMinutes() / 60
                                                let endH = sEnd.getHours() + sEnd.getMinutes() / 60
                                                
                                                // Adjust for day boundaries
                                                if (sStart < startOfDay(day)) startH = startHour // Clip start
                                                if (sEnd > endOfDay(day)) endH = safeEndHour // Clip end
                                                else if (sEnd < sStart) endH += 24 // Cross day logic if within view
                                                
                                                // If completely out of view (should be filtered but double check)
                                                if (endH < startHour || startH > safeEndHour) return null

                                                const left = ((startH - startHour) / totalViewHours) * 100
                                                const width = ((endH - startH) / totalViewHours) * 100

                                                return (
                                                    <div
                                                        key={shift.id}
                                                        className="absolute top-0 bottom-0 bg-blue-600/80 text-white text-[10px] flex items-center justify-center overflow-hidden whitespace-nowrap rounded-sm px-1 border-l border-r border-blue-400 print:whitespace-nowrap print:overflow-visible print:[text-shadow:0_1px_2px_rgb(0_0_0_/_80%)]"
                                                        style={{ 
                                                            left: `${Math.max(0, left)}%`, 
                                                            width: `${Math.min(100, width)}%` 
                                                        }}
                                                    >
                                                        {format(sStart, 'HH:mm')} - {format(sEnd, 'HH:mm')}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Staff Count / Coverage Row */}
                        <div className="flex h-8 items-center mt-4 border-t border-slate-200 pt-2">
                             <div className="w-48 flex-shrink-0 pr-4 text-sm font-bold text-slate-900 uppercase">
                                {t('totalStaff') || 'Total Staff'}
                             </div>
                             <div className="flex-1 relative h-6 flex">
                                {hours.map(hour => {
                                    const count = getStaffCount(day, hour)
                                    return (
                                        <div 
                                            key={hour} 
                                            className={cn(
                                                "flex-1 border-l border-slate-100 flex items-center justify-center text-xs font-bold",
                                                count === 0 ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-600"
                                            )}
                                        >
                                            {count > 0 ? count : '-'}
                                        </div>
                                    )
                                })}
                             </div>
                        </div>

                    </div>
                 </div>
             ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
