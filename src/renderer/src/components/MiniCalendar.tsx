import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isToday 
} from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '../hooks/useSettings'

export default function MiniCalendar(): React.JSX.Element {
  const { settings } = useSettings()
  const [currentDate, setCurrentDate] = useState(new Date())
  
  const locale = settings.language === 'es' ? es : undefined

  const nextMonth = (): void => setCurrentDate(addMonths(currentDate, 1))
  const prevMonth = (): void => setCurrentDate(subMonths(currentDate, 1))

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }) // Monday start
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const days = eachDayOfInterval({ start: startDate, end: endDate })

  const weekDaysEn = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const weekDaysEs = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
  const currentWeekDays = settings.language === 'es' ? weekDaysEs : weekDaysEn

  return (
    <div className="px-2 py-4 border-t border-slate-200 dark:border-slate-800 mt-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button 
            onClick={prevMonth} 
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
            <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize">
            {format(currentDate, 'MMMM yyyy', { locale })}
        </span>
        <button 
            onClick={nextMonth} 
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
            <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Days Header */}
      <div className="grid grid-cols-7 mb-1">
        {currentWeekDays.map((d, i) => (
            <div key={i} className="text-center text-[10px] text-slate-400 font-medium py-1">
                {d}
            </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-y-1 gap-x-0.5">
        {days.map((day, idx) => (
            <div 
                key={idx} 
                className={cn(
                    "text-center text-[10px] p-1 rounded-md flex items-center justify-center h-6 w-full",
                    !isSameMonth(day, monthStart) && "text-slate-300 dark:text-slate-700",
                    isSameMonth(day, monthStart) && "text-slate-600 dark:text-slate-400",
                    isToday(day) && "bg-blue-600 text-white font-semibold shadow-sm"
                )}
            >
                {format(day, 'd')}
            </div>
        ))}
      </div>
    </div>
  )
}
