import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, Loader2, Printer } from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Employee, Shift } from '../types'
import { useSettings } from '../hooks/useSettings'
import ShiftTimelineItem from './ShiftTimelineItem'

interface PrintWeekModalProps {
  isOpen: boolean
  onClose: () => void
  employee: Employee
  weekDays: Date[]
  shifts: Shift[]
}

export default function PrintWeekModal({
  isOpen,
  onClose,
  employee,
  weekDays,
  shifts
}: PrintWeekModalProps): React.JSX.Element | null {
  const { t, settings } = useSettings()
  const [isGenerating, setIsGenerating] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  
  const dateLocale = settings.language === 'es' ? es : undefined

  // Business Hours Logic for Timeline
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

  const handleExport = async (type: 'png' | 'pdf') => {
    if (!printRef.current) return
    setIsGenerating(true)

    try {
      // Create canvas
      const canvas = await html2canvas(printRef.current, {
        scale: 3, // Higher quality and better alignment
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        allowTaint: true
      })

      const filename = `${t('schedule') || 'schedule'}-${employee.name.replace(/\s+/g, '-')}-${format(weekDays[0], 'yyyy-MM-dd')}`

      if (type === 'png') {
        const dataUrl = canvas.toDataURL('image/png')
        // Use Electron API to save and open
        if ((window as any).api && (window as any).api.utils && (window as any).api.utils.saveExport) {
            await (window as any).api.utils.saveExport(dataUrl, `${filename}.png`)
        } else {
            // Fallback for web
            const link = document.createElement('a')
            link.download = `${filename}.png`
            link.href = dataUrl
            link.click()
        }
      } else {
        const imgData = canvas.toDataURL('image/png')
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'px',
          format: [canvas.width, canvas.height]
        })
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)
        
        // Use Electron API to save and open
        if ((window as any).api && (window as any).api.utils && (window as any).api.utils.saveExport) {
            const pdfOutput = pdf.output('datauristring')
            await (window as any).api.utils.saveExport(pdfOutput, `${filename}.pdf`)
        } else {
            // Fallback for web
            pdf.save(`${filename}.pdf`)
        }
      }
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {t('exportSchedule') || 'Export Schedule'} - {employee.name}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content (Scrollable) */}
        <div className="flex-1 overflow-auto p-6 bg-slate-100 dark:bg-slate-900">
          <div className="flex justify-center">
             {/* The Printable Area */}
             <div 
               ref={printRef} 
               className="bg-white text-slate-900 p-8 rounded-lg shadow-sm min-w-[800px] max-w-[1000px]"
             >
                <div className="mb-6 flex justify-between items-end border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-4">
                        {settings.companyLogo && (
                             <img src={settings.companyLogo} alt="Logo" className="h-16 w-auto object-contain" />
                        )}
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">{settings.companyName}</h1>
                            <p className="text-slate-500 text-sm mt-1">{t('employee')}: <span className="font-semibold text-slate-900">{employee.name}</span></p>
                            <p className="text-slate-500 text-sm">{t('role')}: {employee.role}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">{t('weekOf')}</p>
                        <p className="text-lg font-bold text-slate-900 capitalize">
                            {format(weekDays[0], 'MMMM d, yyyy', { locale: dateLocale })}
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                    {weekDays.map(day => {
                        const dayShifts = shifts.filter(s => {
                            const start = parseISO(s.startTime)
                            // Basic check: is start on this day? 
                            // Or should we check intersection? 
                            // Shifts usually start on the day they belong to in this system.
                            // The `getShiftsForCell` logic in Shifts.tsx just checks if shift STARTS on that day.
                            // We should replicate that or assume passed shifts are correct.
                            // But here we receive ALL shifts for the employee and filter them.
                            return format(start, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
                        })

                        return (
                            <div key={day.toISOString()} className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-32 font-semibold text-slate-700 capitalize">
                                        {format(day, 'EEEE d', { locale: dateLocale })}
                                    </div>
                                    {dayShifts.length === 0 && (
                                        <span className="text-xs text-slate-400 italic">{t('noShiftsForDay')}</span>
                                    )}
                                </div>
                                
                                {/* Timeline Bar */}
                                <div className="relative h-12 bg-slate-100 rounded border border-slate-200 overflow-hidden">
                                    {/* Grid Lines */}
                                    <div className="absolute inset-0 flex pointer-events-none">
                                        {hours.map((hour) => (
                                            <div key={hour} className="flex-1 border-l border-slate-200 first:border-l-0 relative group">
                                                {/* Labels moved to header */}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Shifts */}
                                    {dayShifts.map(shift => (
                                        <ShiftTimelineItem
                                            key={shift.id}
                                            shift={shift}
                                            startHour={startHour}
                                            totalHours={totalViewHours}
                                            containerRef={{ current: null } as any} // No drag in print view
                                            onUpdate={() => Promise.resolve()} // Read-only
                                            onEdit={() => {}} // Read-only
                                            readOnly={true}
                                            className="top-2 bottom-2 absolute rounded bg-blue-500 border-blue-600 shadow-sm !cursor-default !pointer-events-none"
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between text-xs text-slate-400">
                    <span>{t('generatedOn')} {format(new Date(), 'Pp', { locale: dateLocale })}</span>
                    <span>Page 1/1</span>
                </div>
             </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            {t('cancel')}
          </button>
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
      </div>
    </div>,
    document.body
  )
}
