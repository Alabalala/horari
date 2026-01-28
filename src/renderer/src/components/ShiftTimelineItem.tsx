import { useState, useRef, useEffect } from 'react'
import { parseISO, format, addDays, startOfDay, addMinutes } from 'date-fns'
import { cn } from '@renderer/lib/utils'
import { Shift } from '../types'
import { useSettings } from '../hooks/useSettings'

interface ShiftTimelineItemProps {
  shift: Shift
  startHour: number
  totalHours: number
  containerRef: React.RefObject<HTMLDivElement | null>
  onUpdate: (id: number, newStart: string, newEnd: string) => Promise<void> | void
  onEdit: (shift: Shift) => void
  onContextMenu?: (e: React.MouseEvent, shift: Shift) => void
  className?: string
  readOnly?: boolean
}

export default function ShiftTimelineItem({
  shift,
  startHour,
  totalHours,
  containerRef,
  onUpdate,
  onEdit,
  onContextMenu,
  className,
  readOnly = false
}: ShiftTimelineItemProps): React.JSX.Element {
  const { t } = useSettings()
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null)
  
  // Helper to normalize hours relative to startHour
  const getNormalizedHours = (date: Date) => {
    const h = date.getHours() + date.getMinutes() / 60
    return h < startHour ? h + 24 : h
  }

  // Parse initial times
  const initialStart = parseISO(shift.startTime)
  const initialEnd = parseISO(shift.endTime)
  const initialStartHour = getNormalizedHours(initialStart)
  let initialEndHour = getNormalizedHours(initialEnd)
  if (initialEndHour < initialStartHour) initialEndHour += 24

  // Local state for smooth dragging
  const [currentStartHour, setCurrentStartHour] = useState(initialStartHour)
  const [currentEndHour, setCurrentEndHour] = useState(initialEndHour)

  // Ref to track current values for mouseup handler (avoids state staleness)
  const currentValuesRef = useRef({ start: initialStartHour, end: initialEndHour })

  // Update local state when prop changes (if not resizing)
  useEffect(() => {
    if (!isResizing) {
      const start = parseISO(shift.startTime)
      const end = parseISO(shift.endTime)
      const sH = getNormalizedHours(start)
      let eH = getNormalizedHours(end)
      if (eH < sH) eH += 24
      
      setCurrentStartHour(sH)
      setCurrentEndHour(eH)
      currentValuesRef.current = { start: sH, end: eH }
    }
  }, [shift, isResizing, startHour])

  // Calculate position percentages
  const left = ((currentStartHour - startHour) / totalHours) * 100
  const width = ((currentEndHour - currentStartHour) / totalHours) * 100

  // Robust handler for resizing
  const startResize = (e: React.MouseEvent, direction: 'left' | 'right') => {
    e.stopPropagation()
    e.preventDefault() // Prevent text selection
    setIsResizing(direction)
    
    const startX = e.clientX
    // Capture the *current* state as the starting point for this drag
    const startValues = { ...currentValuesRef.current }
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!containerRef.current) return
        const containerWidth = containerRef.current.getBoundingClientRect().width
        const deltaPixels = moveEvent.clientX - startX
        const deltaHours = (deltaPixels / containerWidth) * totalHours
        
        if (direction === 'left') {
            let newStart = startValues.start + deltaHours
            newStart = Math.max(startHour, Math.min(newStart, startValues.end - 0.25))
            setCurrentStartHour(newStart)
            currentValuesRef.current.start = newStart
        } else {
            let newEnd = startValues.end + deltaHours
            newEnd = Math.max(startValues.start + 0.25, Math.min(newEnd, startHour + totalHours))
            setCurrentEndHour(newEnd)
            currentValuesRef.current.end = newEnd
        }
    }

    const handleMouseUp = async () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)

        // Commit changes
        const snap = (h: number) => Math.round(h * 4) / 4
        // Use the REF which tracks the immediate values from mousemove
        const finalStart = direction === 'left' ? snap(currentValuesRef.current.start) : startValues.start
        const finalEnd = direction === 'right' ? snap(currentValuesRef.current.end) : startValues.end
        
        // Calculate Anchor Date (Business Day Start)
        const originalStart = parseISO(shift.startTime)
        const originalStartH = originalStart.getHours() + originalStart.getMinutes() / 60
        // If original start hour was < startHour, it means it belonged to "tomorrow" relative to business day start
        const isNextDay = originalStartH < startHour
        const anchorDate = startOfDay(isNextDay ? addDays(originalStart, -1) : originalStart)
        
        const newStart = addMinutes(anchorDate, finalStart * 60)
        const newEnd = addMinutes(anchorDate, finalEnd * 60)

        // Wait for update to complete before resetting resizing state
        // This prevents "snap back" visual glitch
        try {
            await onUpdate(shift.id, newStart.toISOString(), newEnd.toISOString())
        } finally {
            setIsResizing(null)
        }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const formatDisplayTime = (h: number) => {
      const normalized = h % 24
      const hours = Math.floor(normalized)
      const mins = Math.round((normalized - hours) * 60)
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
  }

  const getShiftStyle = () => {
    if (shift.type === 'absence') {
        switch (shift.absenceType) {
            case 'bank_holiday':
                return "bg-red-500/90 border-red-700 text-white"
            case 'sick_leave':
                return "bg-green-600/90 border-green-800 text-white"
            case 'unpaid':
                return "bg-slate-500/90 border-slate-700 text-white line-through decoration-white/70"
            case 'holiday':
                return "bg-purple-500/90 border-purple-700 text-white"
            default:
                return "bg-orange-500/90 border-orange-700 text-white"
        }
    }
    return "bg-blue-600/80 border-blue-400 text-white"
  }

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 rounded-sm text-[10px] flex items-center justify-center overflow-hidden whitespace-nowrap px-1 group cursor-pointer border-l border-r select-none z-10 print:whitespace-nowrap print:overflow-visible print:[text-shadow:0_1px_2px_rgb(0_0_0_/_80%)]",
        getShiftStyle(),
        isResizing && "z-20 ring-2 ring-blue-400 opacity-90",
        readOnly && "cursor-default border-none",
        className
      )}
      style={{ left: `${left}%`, width: `${width}%` }}
      onDoubleClick={(e) => {
        if (readOnly) return
        e.stopPropagation()
        onEdit(shift)
      }}
      onContextMenu={(e) => {
        if (onContextMenu && !readOnly) {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(e, shift)
        }
      }}
      title={`${shift.type === 'absence' ? (shift.absenceType ? t(shift.absenceType) : t('absence')) + ' ' : ''}${formatDisplayTime(currentStartHour)} - ${formatDisplayTime(currentEndHour)}`}
    >
      {/* Left Handle */}
      {!readOnly && (
        <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 flex items-center justify-center"
            onMouseDown={(e) => startResize(e, 'left')}
        >
            <div className="w-0.5 h-3 bg-white/30 rounded-full" />
        </div>
      )}

      <span className={cn("px-1", !readOnly && "truncate px-2")}>
        {shift.type === 'absence' && shift.absenceType === 'unpaid' ? (
             // For unpaid, we might want to show text clearly despite strikethrough
             <span className="no-underline">{formatDisplayTime(currentStartHour)} - {formatDisplayTime(currentEndHour)}</span>
        ) : (
             <>{formatDisplayTime(currentStartHour)} - {formatDisplayTime(currentEndHour)}</>
        )}
      </span>

      {/* Right Handle */}
      {!readOnly && (
        <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 flex items-center justify-center"
            onMouseDown={(e) => startResize(e, 'right')}
        >
            <div className="w-0.5 h-3 bg-white/30 rounded-full" />
        </div>
      )}
    </div>
  )
}
