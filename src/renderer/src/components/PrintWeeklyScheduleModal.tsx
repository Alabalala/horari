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
  endOfDay,
  addHours,
  areIntervalsOverlapping
} from 'date-fns'
import { es } from 'date-fns/locale'
import { X, Download, ChevronDown, Loader2, Check, Settings2 } from 'lucide-react'
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
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(['all'])
  const [isDeptOpen, setIsDeptOpen] = useState(false)
  const [visibleDays, setVisibleDays] = useState<string[]>([])
  const [isDaysOpen, setIsDaysOpen] = useState(false)
  const [isCompact, setIsCompact] = useState(false)
  
  const [isGenerating, setIsGenerating] = useState(false)
  const [pages, setPages] = useState<Date[][]>([])
  const printRef = useRef<HTMLDivElement>(null)
  const dayRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const deptDropdownRef = useRef<HTMLDivElement>(null)
  const daysDropdownRef = useRef<HTMLDivElement>(null)

  if (!isOpen) return null

  const dateLocale = settings.language === 'es' ? es : undefined
  
  // Get week days
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
  const allWeekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // Initialize visible days
  useEffect(() => {
    if (visibleDays.length === 0 && allWeekDays.length > 0) {
        setVisibleDays(allWeekDays.map(d => d.toISOString()))
    }
  }, [isOpen, currentDate])

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(event.target as Node)) {
        setIsDeptOpen(false)
      }
      if (daysDropdownRef.current && !daysDropdownRef.current.contains(event.target as Node)) {
        setIsDaysOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const weekDays = allWeekDays.filter(d => visibleDays.includes(d.toISOString()))

  // Reset pages on open or filter change
  useEffect(() => {
    setPages([])
  }, [isOpen, selectedDepartments, visibleDays, isCompact, currentDate])

  // Pagination Logic
  useEffect(() => {
    if (pages.length > 0) return // Already paginated

    // Wait for render
    const timer = setTimeout(() => {
      if (!printRef.current) return

      const newPages: Date[][] = []
      let currentPage: Date[] = []
      let currentHeight = 0
      const PAGE_HEIGHT_MM = 297 // A4
      const MARGIN_MM = 10 // Top + Bottom margin (Reduced from 20 to 10 for more space)
      const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_MM
      const PX_PER_MM = 3.78 // Approx for screen

      // Header Height (approx)
      const headerEl = printRef.current.querySelector('[data-print-target="header"]')
      const headerHeight = headerEl ? headerEl.clientHeight : 100
      
      currentHeight += headerHeight

      weekDays.forEach(day => {
        const dayEl = dayRefs.current[day.toISOString()]
        if (dayEl) {
          const dayHeight = dayEl.clientHeight + (isCompact ? 4 : 8) // + gap
          
          if (currentHeight + dayHeight > (CONTENT_HEIGHT_MM * PX_PER_MM)) {
            // New Page
            if (currentPage.length > 0) newPages.push(currentPage)
            currentPage = [day]
            currentHeight = dayHeight // No header on subsequent pages
          } else {
            currentPage.push(day)
            currentHeight += dayHeight
          }
        }
      })
      
      if (currentPage.length > 0) newPages.push(currentPage)
      setPages(newPages)
    }, 100)

    return () => clearTimeout(timer)
  }, [weekDays, pages.length, selectedDepartments, shifts, isCompact])

  // Filter employees
  const filteredEmployees = employees.filter(emp => 
    selectedDepartments.includes('all') || selectedDepartments.includes(emp.department)
  )

  // Get unique departments
  const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)))

  // Handlers for multiselect
  const toggleDepartment = (dept: string) => {
    if (dept === 'all') {
        setSelectedDepartments(['all'])
    } else {
        let newSelection = [...selectedDepartments]
        if (newSelection.includes('all')) {
            newSelection = [...departments]
        }
        
        if (newSelection.includes(dept)) {
            newSelection = newSelection.filter(d => d !== dept)
        } else {
            newSelection.push(dept)
        }
        
        if (newSelection.length === 0) {
             setSelectedDepartments([])
        } else if (newSelection.length === departments.length) {
            setSelectedDepartments(['all'])
        } else {
            setSelectedDepartments(newSelection)
        }
    }
  }

  const toggleDay = (dayIso: string) => {
    if (visibleDays.includes(dayIso)) {
        // Prevent unselecting the last day? Or allow empty? Allow empty is fine but weird.
        if (visibleDays.length > 1) {
            setVisibleDays(visibleDays.filter(d => d !== dayIso))
        }
    } else {
        // Add back in correct order
        const newDays = [...visibleDays, dayIso]
        // Sort by actual date
        newDays.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
        setVisibleDays(newDays)
    }
  }

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
      if (Number(s.employeeId) !== Number(empId)) return false
      
      const sStart = parseISO(s.startTime)
      const sEnd = parseISO(s.endTime)
      const dayStart = startOfDay(day)
      const dayEnd = endOfDay(day)
      
      // STRICT DAY CHECK: Only show parts of the shift that fall within THIS day (00:00 - 23:59)
      // If a shift starts at 22:00 on Saturday and ends at 06:00 Sunday:
      // - On Saturday, it shows 22:00 - 24:00 (technically) -> but we want to show the BAR for this day if it starts or overlaps this day
      // BUT user said: "If an ee works 20 to 01 on a saturday, it should only show in saturday, not in sunday too"
      // This means we should only show shifts that START on this day?
      // Or if it spills over, we should NOT show it on the next day?
      
      // Interpretation:
      // A shift belongs to the "Logical Day" it started on.
      // If sStart is on Saturday, show it on Saturday (even if it goes to Sunday 01:00).
      // Do NOT show it on Sunday.
      
      // Logic: Shift must START on this day.
      // Exception: What if a shift starts at 00:00? It belongs to that day.
      
      // Let's use "Shift Start Time" determines the day.
      // We must compare the shift's start date with the current 'day'.
      
      const shiftStartDay = startOfDay(sStart)
      return isSameDay(shiftStartDay, day)
    })
  }

  // Helper to calculate staff count per hour
  const getStaffCount = (day: Date, hour: number) => {
    const dayStart = startOfDay(day)
    
    // Define the time slot for this hour
    const slotStart = addHours(dayStart, hour)
    const slotEnd = addHours(dayStart, hour + 1)
    
    // Find all shifts that overlap with this time slot
    // We filter shifts first to avoid iterating employees unnecessarily
    const activeEmployeeIds = new Set<number>()

    shifts.forEach(s => {
        const sStart = parseISO(s.startTime)
        const sEnd = parseISO(s.endTime)
        
        if (sStart >= sEnd) return

        // VISUAL CONSISTENCY CHECK:
        // We only want to count this shift if it would be VISIBLE on this day.
        // Based on the new rule: Shift belongs to the day it STARTS.
        // So if we are checking "Sunday 00:00-01:00" but the shift started "Saturday 22:00",
        // this shift is visually on Saturday.
        // It should NOT contribute to Sunday's Red Line.
        // It SHOULD contribute to Saturday's Red Line (even past midnight).
        
        // HOWEVER: The 'day' parameter here is the row we are rendering.
        // If we are rendering Saturday, and checking hour 25 (Sunday 01:00), we want to count it.
        // If we are rendering Sunday, and checking hour 0 (Sunday 00:00), we do NOT want to count Saturday's shift.
        
        // So: Does this shift belong to 'day'?
        const shiftStartDay = startOfDay(sStart)
        if (!isSameDay(shiftStartDay, day)) {
            return // This shift belongs to another day, ignore it for THIS day's count
        }

        // Check overlap using date-fns
        if (areIntervalsOverlapping(
            { start: sStart, end: sEnd },
            { start: slotStart, end: slotEnd }
        )) {
            activeEmployeeIds.add(Number(s.employeeId))
        }
    })

    // Count how many of the currently filtered employees are active
    let count = 0
    filteredEmployees.forEach(emp => {
        if (activeEmployeeIds.has(Number(emp.id))) {
            count++
        }
    })
    
    return count
  }

  const handleExport = async (type: 'pdf' | 'png') => {
    setIsGenerating(true)

    try {
        const filename = `${t('schedule') || 'schedule'}-${format(weekStart, 'yyyy-MM-dd')}-week`
        const pageElements = document.querySelectorAll('[data-print-page]')
        
        // If no pages rendered yet (shouldn't happen if open), use printRef
        if (pageElements.length === 0 && !printRef.current) {
             throw new Error("No content to export")
        }

        if (type === 'png') {
            // Combine all pages into one PNG
            let masterCanvas: HTMLCanvasElement | null = null
            let totalHeight = 0
            let maxWidth = 0
            
            const canvases: HTMLCanvasElement[] = []

            const elementsToCapture = pageElements.length > 0 
                ? Array.from(pageElements) 
                : [printRef.current!]

            for (const el of elementsToCapture) {
                const canvas = await html2canvas(el as HTMLElement, {
                    scale: 2,
                    backgroundColor: '#ffffff',
                    logging: false,
                    useCORS: true,
                    allowTaint: true
                })
                canvases.push(canvas)
                totalHeight += canvas.height
                maxWidth = Math.max(maxWidth, canvas.width)
            }

            if (canvases.length > 1) {
                // Multiple pages: Save as separate files
                const dataUrls = canvases.map(c => c.toDataURL('image/png'))
                
                if ((window as any).api && (window as any).api.utils && (window as any).api.utils.saveExport) {
                    const result = await (window as any).api.utils.saveExport(dataUrls, `${filename}.png`)
                    if (result && result.canceled) {
                        // User canceled
                    }
                }
            } else {
                // Single page: Save as one file
                masterCanvas = document.createElement('canvas')
                masterCanvas.width = maxWidth
                masterCanvas.height = totalHeight
                const ctx = masterCanvas.getContext('2d')
                
                if (ctx) {
                    let currentY = 0
                    for (const canvas of canvases) {
                        ctx.drawImage(canvas, 0, currentY)
                        currentY += canvas.height
                    }
                    
                    const dataUrl = masterCanvas.toDataURL('image/png')
                    
                    if ((window as any).api && (window as any).api.utils && (window as any).api.utils.saveExport) {
                        const result = await (window as any).api.utils.saveExport(dataUrl, `${filename}.png`)
                        if (result && result.canceled) {
                            // User canceled
                        }
                    } else {
                        const link = document.createElement('a')
                        link.download = `${filename}.png`
                        link.href = dataUrl
                        link.click()
                    }
                }
            }
        } else {
            // PDF Export with Multi-Page Logic
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            })

            const pageWidth = pdf.internal.pageSize.getWidth() // 210
            const pageHeight = pdf.internal.pageSize.getHeight() // 297

            const elementsToCapture = pageElements.length > 0 
                ? Array.from(pageElements) 
                : [printRef.current!]

            for (let i = 0; i < elementsToCapture.length; i++) {
                 const pageEl = elementsToCapture[i] as HTMLElement
                 
                 if (i > 0) pdf.addPage()
                 
                 const canvas = await html2canvas(pageEl, {
                    scale: 3,
                    backgroundColor: '#ffffff',
                    logging: false,
                    useCORS: true,
                    allowTaint: true
                })
                const imgData = canvas.toDataURL('image/png')
                pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight)
            }

            if ((window as any).api && (window as any).api.utils && (window as any).api.utils.saveExport) {
                const pdfOutput = pdf.output('datauristring')
                const result = await (window as any).api.utils.saveExport(pdfOutput, `${filename}.pdf`)
                if (result && result.canceled) {
                    // User canceled
                }
            } else {
                pdf.save(`${filename}.pdf`)
            }
        }

    } catch (err) {
        console.error('Export failed:', err)
        alert('Export failed. Please check the console for details.')
    } finally {
        setIsGenerating(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden">
        {/* Header Controls */}
        <div className="flex items-center justify-between p-4 border-b shrink-0 bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {t('exportSchedule') || 'Export Weekly Schedule'}
            </h2>
            <p className="text-sm text-slate-500">
              {t('preview') || 'Preview'}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Compact Toggle */}
            <button
                onClick={() => setIsCompact(!isCompact)}
                className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors",
                    isCompact 
                        ? "bg-slate-900 text-white border-slate-900" 
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                )}
            >
                {isCompact ? <Check className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
                {t('compactView') || 'Compact'}
            </button>

            {/* Days Dropdown */}
            <div className="relative" ref={daysDropdownRef}>
                <button
                    onClick={() => setIsDaysOpen(!isDaysOpen)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
                >
                    <span>{t('days') || 'Days'} ({visibleDays.length})</span>
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
                
                {isDaysOpen && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-slate-200 z-50 py-1 overflow-hidden">
                        {allWeekDays.map(day => {
                            const isSelected = visibleDays.includes(day.toISOString())
                            return (
                                <button
                                    key={day.toISOString()}
                                    onClick={() => toggleDay(day.toISOString())}
                                    className="flex items-center w-full px-4 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                                >
                                    <div className={cn(
                                        "w-4 h-4 mr-3 rounded border flex items-center justify-center transition-colors",
                                        isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300"
                                    )}>
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <span className={isSelected ? "text-slate-900 font-medium" : "text-slate-600"}>
                                        {format(day, 'EEEE', { locale: dateLocale })}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Departments Dropdown */}
            <div className="relative" ref={deptDropdownRef}>
                <button
                    onClick={() => setIsDeptOpen(!isDeptOpen)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
                >
                    <span>{t('departments') || 'Departments'} ({selectedDepartments.includes('all') ? 'All' : selectedDepartments.length})</span>
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
                
                {isDeptOpen && (
                    <div className="absolute top-full right-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-slate-200 z-50 py-1 overflow-hidden">
                        <button
                            onClick={() => toggleDepartment('all')}
                            className="flex items-center w-full px-4 py-2 text-sm text-left hover:bg-slate-50 transition-colors border-b border-slate-100"
                        >
                            <div className={cn(
                                "w-4 h-4 mr-3 rounded border flex items-center justify-center transition-colors",
                                selectedDepartments.includes('all') ? "bg-blue-600 border-blue-600" : "border-slate-300"
                            )}>
                                {selectedDepartments.includes('all') && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <span className={selectedDepartments.includes('all') ? "text-slate-900 font-medium" : "text-slate-600"}>
                                {t('allDepartments') || 'All Departments'}
                            </span>
                        </button>
                        
                        <div className="max-h-[300px] overflow-y-auto">
                            {departments.map(dept => {
                                const isChecked = selectedDepartments.includes('all') || selectedDepartments.includes(dept)
                                return (
                                    <button
                                        key={dept}
                                        onClick={() => toggleDepartment(dept)}
                                        className="flex items-center w-full px-4 py-2 text-sm text-left hover:bg-slate-50 transition-colors"
                                    >
                                        <div className={cn(
                                            "w-4 h-4 mr-3 rounded border flex items-center justify-center transition-colors",
                                            isChecked ? "bg-blue-600 border-blue-600" : "border-slate-300"
                                        )}>
                                            {isChecked && <Check className="h-3 w-3 text-white" />}
                                        </div>
                                        <span className={isChecked ? "text-slate-900 font-medium" : "text-slate-600"}>
                                            {dept}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2 border-l pl-4 border-slate-300">
                <button
                onClick={() => handleExport('png')}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export PNG
                </button>
                <button
                onClick={() => handleExport('pdf')}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
                >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Export PDF
                </button>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors ml-2"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Hidden Container for Export - Always renders ALL content in one go (or paginated, but strictly for export) */}
        {/* Actually, since we support multi-page export, we can reuse the paginated logic BUT:
            - The preview container is scaled/responsive.
            - Export needs fixed A4 dimensions.
            - We currently grab `data-print-page` from the preview.
            - If the preview is scaled down (via CSS transform or flex), html2canvas might capture it weirdly.
            - The user says "text is still not aligned but only when it's exported in the preview iut loooks PERFECT".
            - This suggests a rendering difference between what they see and what html2canvas captures.
            - html2canvas captures the DOM as-is.
            - If the preview is perfect, the export *should* be perfect, UNLESS:
              1. CSS styles are different for print media (we use print: classes?).
              2. Screen resolution / scaling issues.
              3. Font loading issues.
              
            Let's ensure the export container is explicitly sized and not affected by flex scaling.
            The current preview uses `w-[210mm] min-w-[210mm]` inside a flex container.
            
            Key fix: Ensure vertical alignment is enforced by flexbox in the export too.
            I added `flex items-center justify-center` to the cells.
            
            Let's try to enforce a specific "export mode" where we clone the node or use a dedicated hidden container for export if needed.
            But first, let's trust the recent CSS fixes (flex centering) which I just applied.
            
            Wait, I missed one thing: The user said "blue lines spilling over to next day still not fixed".
            I fixed the LOGIC in `getShiftsForDayAndEmployee` (Strict Day Check).
            I also fixed the LOGIC in `getStaffCount` (Strict Day Check).
            
            Now let's check the VISUAL rendering of the blue bar.
            It uses:
            const left = Math.max(0, ((startH - startHour) / totalViewHours) * 100)
            const width = Math.min(100 - left, ((endH - startH) / totalViewHours) * 100)
            
            If a shift is 20:00 - 01:00 (next day).
            startH = 20. endH = 25.
            totalViewHours (say 8 to 24) = 16.
            startHour = 8.
            
            (20 - 8) / 16 = 12/16 = 75% left.
            (25 - 20) / 16 = 5/16 = 31.25% width.
            75 + 31.25 = 106.25%.
            
            Math.min(100 - 75, 31.25) -> Math.min(25, 31.25) -> 25%.
            So width stops at 100%.
            It visually cuts off at the end of the day.
            
            So visually it should be correct for the current day.
            
            What about the NEXT day?
            The shift 20:00-01:00 (Sat-Sun).
            On Sunday:
            `getShiftsForDayAndEmployee` now filters it OUT because `isSameDay(shiftStart, Sunday)` is false.
            So it shouldn't render at all on Sunday.
            
            This logic seems correct now.
            
            Re: Text alignment in export.
            "text is still not aligned but only when it's exported... in the preview iut loooks PERFECT"
            
            Html2Canvas issues with flex centering?
            Sometimes html2canvas needs explicit `display: flex` and alignment properties.
            I added `flex items-center justify-center h-full` to the inner content.
            
            One potential issue: `leading-none`.
            If the font size is small (9px), leading-none might make it look top-aligned if the container is tall.
            But `items-center` should handle it.
            
            Let's ensure the `DayContent` component is fully updated.
            Wait, `DayContent` is used in the code but I don't see its definition in the read output.
            Ah, I must have missed that it's a separate component or defined below.
            Let me read the rest of the file to be sure I didn't miss `DayContent`.
        */}
        
        {/* Preview Content - Scalable Container */}
        <div className="flex-1 overflow-auto bg-slate-100 p-8 flex flex-col items-center gap-8">
            {/* If not paginated yet, render everything in one hidden/visible block to measure */}
            {pages.length === 0 ? (
                 <div 
                    ref={printRef}
                    className="bg-white shadow-lg w-[210mm] min-w-[210mm] p-4 flex flex-col gap-4 select-none pointer-events-none opacity-0 absolute" 
                    style={{ minHeight: '297mm' }} 
                 >
                     {/* Header for measurement */}
                    <div data-print-target="header" className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
                        <div className="flex items-center gap-6">
                            {settings.companyLogo && (
                                <img src={settings.companyLogo} alt="Logo" className="h-16 w-auto object-contain" />
                            )}
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 uppercase tracking-tight">
                                    {t('weeklySchedule') || 'Weekly Schedule'}
                                </h1>
                                <p className="text-lg text-slate-600 mt-1">
                                    {t('weekOf') || 'Week of'} <span className="font-semibold text-slate-900">{format(weekStart, 'MMMM d, yyyy', { locale: dateLocale })}</span> - <span className="font-semibold text-slate-900">{format(weekEnd, 'MMMM d, yyyy', { locale: dateLocale })}</span>
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-bold text-slate-900">{settings.companyName}</div>
                            <div className="text-sm text-slate-500 mt-1">
                                {t('generatedOn') || 'Generated on'}: {format(new Date(), 'PP', { locale: dateLocale })}
                            </div>
                        </div>
                    </div>
                    
                    {/* All Days for measurement */}
                    <div className="flex flex-col gap-4">
                        {weekDays.map(day => (
                             <DayContent 
                                key={day.toISOString()} 
                                day={day} 
                                ref={(el) => { dayRefs.current[day.toISOString()] = el }}
                                dateLocale={dateLocale}
                                hours={hours}
                                filteredEmployees={filteredEmployees}
                                getShiftsForDayAndEmployee={getShiftsForDayAndEmployee}
                                getStaffCount={getStaffCount}
                                startHour={startHour}
                                safeEndHour={safeEndHour}
                                totalViewHours={totalViewHours}
                                t={t}
                                isCompact={isCompact}
                             />
                        ))}
                    </div>
                 </div>
            ) : (
                /* Paginated Render */
                pages.map((pageDays, pageIndex) => (
                    <div 
                        key={pageIndex}
                        ref={pageIndex === 0 ? printRef : undefined} // Keep ref on first page for export (partial logic, export might need adjustment)
                        data-print-page
                        className="bg-white shadow-lg w-[210mm] min-w-[210mm] p-4 flex flex-col gap-4 select-none pointer-events-none relative" 
                        style={{ height: '297mm', minHeight: '297mm' }}
                    >
                         {/* Header only on first page */}
                         {pageIndex === 0 && (
                            <div data-print-target="header" className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
                                <div className="flex items-center gap-6">
                                    {settings.companyLogo && (
                                        <img src={settings.companyLogo} alt="Logo" className={cn("w-auto object-contain", isCompact ? "h-12" : "h-16")} />
                                    )}
                                    <div>
                                        <h1 className={cn("font-bold text-slate-900 uppercase tracking-tight", isCompact ? "text-xl" : "text-3xl")}>
                                            {t('weeklySchedule') || 'Weekly Schedule'}
                                        </h1>
                                        <p className={cn("text-slate-600 mt-1", isCompact ? "text-sm" : "text-lg")}>
                                            {t('weekOf') || 'Week of'} <span className="font-semibold text-slate-900">{format(weekStart, 'MMMM d, yyyy', { locale: dateLocale })}</span> - <span className="font-semibold text-slate-900">{format(weekEnd, 'MMMM d, yyyy', { locale: dateLocale })}</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={cn("font-bold text-slate-900", isCompact ? "text-lg" : "text-xl")}>{settings.companyName}</div>
                                    <div className="text-sm text-slate-500 mt-1">
                                        {t('generatedOn') || 'Generated on'}: {format(new Date(), 'PP', { locale: dateLocale })}
                                    </div>
                                </div>
                            </div>
                         )}

                         <div className={cn("flex flex-col", isCompact ? "gap-2" : "gap-4")}>
                            {pageDays.map(day => (
                                <DayContent 
                                    key={day.toISOString()} 
                                    day={day} 
                                    dateLocale={dateLocale}
                                    hours={hours}
                                    filteredEmployees={filteredEmployees}
                                    getShiftsForDayAndEmployee={getShiftsForDayAndEmployee}
                                    getStaffCount={getStaffCount}
                                    startHour={startHour}
                                    safeEndHour={safeEndHour}
                                    totalViewHours={totalViewHours}
                                    t={t}
                                    isCompact={isCompact}
                                />
                            ))}
                         </div>
                         
                         {/* Page Number */}
                         <div className="absolute bottom-4 right-4 text-xs text-slate-400">
                             Page {pageIndex + 1} of {pages.length}
                         </div>
                    </div>
                ))
            )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// Extracted Component for Reusability (Measurement vs Render)
const DayContent = ({ 
    day, ref, dateLocale, hours, filteredEmployees, getShiftsForDayAndEmployee, getStaffCount, startHour, safeEndHour, totalViewHours, t, isCompact
}: any) => {
    const ROW_HEIGHT = isCompact ? 24 : 32
    const HEADER_HEIGHT = isCompact ? 28 : 40
    const NAME_WIDTH = isCompact ? '10rem' : '16rem'
    const FONT_SIZE_NAME = isCompact ? 'text-[10px]' : 'text-xs'
    const FONT_SIZE_SHIFT = isCompact ? 'text-[9px]' : 'text-[10px]'

    return (
        <div ref={ref} data-print-target="day" className="break-inside-avoid">
            {/* Compact Day Header - Flex Replacement */}
            <div className={cn("flex items-center w-full mb-1 break-inside-avoid", isCompact ? "h-[28px]" : "h-[40px]")}>
                <div className="shrink-0 pr-2">
                    <div className={cn("bg-slate-800 text-white font-bold rounded uppercase text-center flex items-center justify-center", isCompact ? "text-xs w-[40px] h-[20px]" : "text-sm w-[50px] h-[28px]")}>
                        {format(day, 'EEE', { locale: dateLocale })}
                    </div>
                </div>
                <div className="shrink-0 pr-2">
                    <div className={cn("font-semibold text-slate-900 block text-center flex items-center justify-center", isCompact ? "text-xs w-[24px] h-[20px]" : "text-sm w-[30px] h-[28px]")}>
                        {format(day, 'd', { locale: dateLocale })}
                    </div>
                </div>
                <div className="flex-1 flex items-center">
                    <div className="h-px bg-slate-200 w-full"></div>
                </div>
            </div>

            {/* Timeline Grid */}
            <div className="relative border border-slate-200 rounded-md bg-slate-50/50">
                
                {/* Time Header - Flex Layout */}
                <div className="flex w-full border-b border-slate-200 bg-white" style={{ height: `${ROW_HEIGHT}px` }}>
                     <div className="shrink-0 border-r border-slate-100" style={{ width: NAME_WIDTH }}></div> 
                     <div className="flex-1 flex">
                        {hours.map((hour: number, i: number) => (
                             <div 
                                 key={hour} 
                                 className={cn(
                                    "flex-1 flex items-center justify-center font-medium text-slate-400",
                                    isCompact ? "text-[9px]" : "text-[10px]",
                                    i !== 0 && "border-l border-slate-100"
                                 )}
                             >
                                 {hour}
                             </div>
                         ))}
                     </div>
                </div>

                {/* Employees Rows */}
                <div className="divide-y divide-slate-100 bg-white">
                    {filteredEmployees.map((emp: any) => {
                        const dayShifts = getShiftsForDayAndEmployee(day, emp.id)
                        return (
                            <div key={emp.id} className="flex group hover:bg-slate-50 relative" style={{ height: `${ROW_HEIGHT}px` }}>
                                {/* Standard Flexbox Layout (Restored) */}
                                <div 
                                    className="shrink-0 flex items-center px-3 border-r border-slate-100 bg-white"
                                    style={{ 
                                        width: NAME_WIDTH, 
                                        height: `${ROW_HEIGHT}px`
                                    }} 
                                > 
                                    {/* No padding hacks, no line-height locks. Just clean text. */}
                                    <span className={cn("font-medium text-slate-700 truncate w-full", FONT_SIZE_NAME)} title={emp.name}> 
                                        {emp.name}
                                    </span>
                                </div>
                                
                                <div className="flex-1 relative h-full overflow-hidden">
                                    {/* Grid Lines */}
                                    <div className="absolute inset-0 flex pointer-events-none">
                                        {hours.map((hour: number, i: number) => (
                                            <div 
                                                key={hour} 
                                                className={cn(
                                                    "flex-1 min-w-0 border-slate-50",
                                                    i !== 0 && "border-l"
                                                )}
                                            ></div>
                                        ))}
                                    </div>

                                    {/* Shifts */}
                                    {dayShifts.map((shift: any) => {
                                        const sStart = parseISO(shift.startTime)
                                        const sEnd = parseISO(shift.endTime)
                                        const dayStart = startOfDay(day)
                                        
                                        const startH = (sStart.getTime() - dayStart.getTime()) / (1000 * 60 * 60)
                                        const endH = (sEnd.getTime() - dayStart.getTime()) / (1000 * 60 * 60)
                                        
                                        const left = Math.max(0, ((startH - startHour) / totalViewHours) * 100)
                                        const width = Math.min(100 - left, ((endH - startH) / totalViewHours) * 100)

                                        return (
                                            <div 
                                                key={shift.id}
                                                className="absolute top-0.5 bottom-0.5 bg-blue-500/90 rounded-sm border border-blue-600/20 flex items-center justify-center overflow-visible z-10 print:bg-blue-500 print:text-white"
                                                style={{ left: `${left}%`, width: `${width}%` }}
                                            >
                                                <span className={cn("font-bold text-white whitespace-nowrap drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] px-1 flex items-center gap-1", FONT_SIZE_SHIFT)}>
                                                    <span>{format(sStart, 'HH:mm')} - {format(sEnd, 'HH:mm')}</span>
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
                
                {/* Coverage Gaps / Total Staff - Flex Layout */}
                <div className="flex w-full bg-slate-50 border-t border-slate-200 break-inside-avoid" style={{ height: `${ROW_HEIGHT}px` }}>
                    <div className={cn("shrink-0 flex items-center px-3 border-r border-slate-200 font-bold text-slate-500 uppercase tracking-wider", FONT_SIZE_SHIFT)} style={{ width: NAME_WIDTH }}>
                        {t('totalStaff') || 'Total Staff'}
                    </div>
                    <div className="flex-1 flex">
                        {hours.map((hour: number, i: number) => {
                            const count = getStaffCount(day, hour)
                            return (
                                <div 
                                    key={hour} 
                                    className={cn(
                                        "flex-1 flex items-center justify-center font-bold",
                                        isCompact ? "text-[9px]" : "text-[10px]",
                                        i !== 0 && "border-l border-slate-200",
                                        count === 0 ? "bg-red-100 text-red-700" : "text-slate-400"
                                    )}
                                >
                                    {/* Content */}
                                </div>
                            )
                        })}
                    </div>
                </div>

            </div>
        </div>
    )
}
