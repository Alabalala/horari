import { useState, useEffect, useRef } from 'react'
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  addMonths, 
  subMonths, 
  isSameDay, 
  isSameMonth, 
  isSameWeek,
  setMonth,
  setYear,
  addYears,
  subYears,
  startOfYear,
  endOfYear,
  eachMonthOfInterval
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '../hooks/useSettings'

interface DatePickerProps {
  isOpen: boolean
  onClose: () => void
  selectedDate: Date
  onChange: (date: Date) => void
  mode: 'day' | 'week' | 'month'
}

export function DatePicker({ isOpen, onClose, selectedDate, onChange, mode }: DatePickerProps) {
  const { settings } = useSettings()
  const dateLocale = settings.language === 'es' ? es : undefined
  const [viewDate, setViewDate] = useState(selectedDate)
  // 'dates' is for day/week picker. 'months' is for month picker (or navigating to month). 'years' for navigating years.
  const [pickerView, setPickerView] = useState<'dates' | 'months' | 'years'>('dates') 
  
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
        setViewDate(selectedDate)
        // If mode is month, start with months view
        if (mode === 'month') {
            setPickerView('months')
        } else {
            setPickerView('dates')
        }
    }
  }, [isOpen, selectedDate, mode])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // We rely on the parent to handle the trigger click check, 
        // but since this is usually rendered conditionally, 
        // a click on the trigger might have already toggled it.
        // However, usually we put the check here. 
        // For simplicity, we'll assume the parent handles the "outside" check if it's a portal, 
        // but if it's inline absolute, we need to be careful.
        // Actually, let's just use a simple approach: if click is outside THIS container, close.
        // But if the click was on the trigger, the trigger's onClick will fire.
        // If the trigger's onClick toggles, then:
        // Open -> Click Trigger -> Close (via toggle) AND Close (via outside click)?
        // We'll let the parent handle the trigger logic or just expose onClose.
        onClose()
      }
    }
    
    if (isOpen) {
        // Delay adding event listener to avoid immediate close if the click that opened it bubbles up
        setTimeout(() => {
             document.addEventListener('mousedown', handleClickOutside)
        }, 0)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handlePrev = () => {
    if (pickerView === 'dates') {
        setViewDate(subMonths(viewDate, 1))
    } else if (pickerView === 'months') {
        setViewDate(subYears(viewDate, 1))
    } else {
        setViewDate(subYears(viewDate, 10))
    }
  }

  const handleNext = () => {
    if (pickerView === 'dates') {
        setViewDate(addMonths(viewDate, 1))
    } else if (pickerView === 'months') {
        setViewDate(addYears(viewDate, 1))
    } else {
        setViewDate(addYears(viewDate, 10))
    }
  }

  const handleTitleClick = () => {
      if (pickerView === 'dates') setPickerView('months')
      else if (pickerView === 'months') setPickerView('years')
  }

  const renderHeader = () => {
    let title = ''
    if (pickerView === 'dates') {
        title = format(viewDate, 'MMMM yyyy', { locale: dateLocale })
    } else if (pickerView === 'months') {
        title = format(viewDate, 'yyyy', { locale: dateLocale })
    } else {
        const start = Math.floor(viewDate.getFullYear() / 10) * 10
        title = `${start} - ${start + 9}`
    }

    return (
        <div className="flex items-center justify-between mb-4">
            <button 
                onClick={(e) => { e.stopPropagation(); handlePrev() }} 
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
            >
                <ChevronLeft className="h-4 w-4 text-slate-500" />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); handleTitleClick() }}
                className="text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 rounded capitalize"
            >
                {title}
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); handleNext() }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
            >
                <ChevronRight className="h-4 w-4 text-slate-500" />
            </button>
        </div>
    )
  }

  const renderDates = () => {
      const monthStart = startOfMonth(viewDate)
      const monthEnd = endOfMonth(viewDate)
      const startDate = startOfWeek(monthStart, { weekStartsOn: 1 })
      const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })
      
      const days = eachDayOfInterval({ start: startDate, end: endDate })
      const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
      if (settings.language === 'es') {
          // L M X J V S D
          weekDays.splice(0, 7, 'L', 'M', 'X', 'J', 'V', 'S', 'D')
      }

      return (
          <div>
              <div className="grid grid-cols-7 mb-2">
                  {weekDays.map(d => (
                      <div key={d} className="text-xs text-center text-slate-400 font-medium h-8 flex items-center justify-center">
                          {d}
                      </div>
                  ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                  {days.map(day => {
                      const isSelected = mode === 'week' 
                          ? isSameWeek(day, selectedDate, { weekStartsOn: 1 })
                          : isSameDay(day, selectedDate)
                      const isCurrentMonth = isSameMonth(day, viewDate)
                      
                      return (
                          <button
                              key={day.toISOString()}
                              onClick={(e) => {
                                  e.stopPropagation()
                                  onChange(day)
                                  onClose()
                              }}
                              className={cn(
                                  "h-8 w-8 rounded-full flex items-center justify-center text-sm transition-colors",
                                  !isCurrentMonth && "text-slate-300 dark:text-slate-600",
                                  isCurrentMonth && "text-slate-700 dark:text-slate-300",
                                  isSelected && "bg-blue-600 text-white hover:bg-blue-700",
                                  !isSelected && isCurrentMonth && "hover:bg-slate-100 dark:hover:bg-slate-800",
                                  mode === 'week' && isSelected && "rounded-none first:rounded-l-full last:rounded-r-full w-full"
                              )}
                          >
                              {format(day, 'd')}
                          </button>
                      )
                  })}
              </div>
          </div>
      )
  }

  const renderMonths = () => {
      const months = eachMonthOfInterval({
          start: startOfYear(viewDate),
          end: endOfYear(viewDate)
      })

      return (
          <div className="grid grid-cols-3 gap-2">
              {months.map(month => {
                  const isSelected = isSameMonth(month, selectedDate) && isSameYear(month, selectedDate)
                  return (
                      <button
                          key={month.toISOString()}
                          onClick={(e) => {
                              e.stopPropagation()
                              if (mode === 'month') {
                                  onChange(month)
                                  onClose()
                              } else {
                                  setViewDate(month)
                                  setPickerView('dates')
                              }
                          }}
                          className={cn(
                              "h-10 rounded-md text-sm font-medium capitalize transition-colors",
                              isSelected 
                                  ? "bg-blue-600 text-white hover:bg-blue-700"
                                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          )}
                      >
                          {format(month, 'MMM', { locale: dateLocale })}
                      </button>
                  )
              })}
          </div>
      )
  }

  const renderYears = () => {
      const startYear = Math.floor(viewDate.getFullYear() / 10) * 10
      const years = Array.from({ length: 12 }, (_, i) => startYear - 1 + i)

      return (
          <div className="grid grid-cols-4 gap-2">
              {years.map(year => {
                  const isSelected = year === selectedDate.getFullYear()
                  const isCurrentDecade = year >= startYear && year <= startYear + 9
                  
                  return (
                      <button
                          key={year}
                          onClick={(e) => {
                              e.stopPropagation()
                              setViewDate(setYear(viewDate, year))
                              setPickerView('months')
                          }}
                          className={cn(
                              "h-10 rounded-md text-sm font-medium transition-colors",
                              !isCurrentDecade && "text-slate-300 dark:text-slate-600",
                              isCurrentDecade && "text-slate-700 dark:text-slate-300",
                              isSelected && "bg-blue-600 text-white hover:bg-blue-700",
                              !isSelected && isCurrentDecade && "hover:bg-slate-100 dark:hover:bg-slate-800"
                          )}
                      >
                          {year}
                      </button>
                  )
              })}
          </div>
      )
  }

  return (
    <div 
        ref={containerRef}
        className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-[280px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
    >
        {renderHeader()}
        {pickerView === 'dates' && renderDates()}
        {pickerView === 'months' && renderMonths()}
        {pickerView === 'years' && renderYears()}
    </div>
  )
}

function isSameYear(d1: Date, d2: Date) {
    return d1.getFullYear() === d2.getFullYear()
}
