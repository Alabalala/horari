import { useState, useRef, useEffect } from 'react'
import { parseISO, format, addDays, startOfDay, addMinutes } from 'date-fns'
import { cn } from '@renderer/lib/utils'
import { Shift } from '../types'

interface ShiftTimelineItemProps {
  shift: Shift
  startHour: number
  totalHours: number
  containerRef: React.RefObject<HTMLDivElement | null>
  onUpdate: (id: number, newStart: string, newEnd: string) => Promise<void> | void
  onEdit: (shift: Shift) => void
  onContextMenu?: (e: React.MouseEvent, shift: Shift) => void
  className?: string
}

export default function ShiftTimelineItem({
  shift,
  startHour,
  totalHours,
  containerRef,
  onUpdate,
  onEdit,
  onContextMenu,
  className
}: ShiftTimelineItemProps): React.JSX.Element {
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

  return (
    <div
      className={cn(
        "absolute top-1 bottom-1 bg-blue-600/80 rounded-sm text-[10px] text-white flex items-center justify-center overflow-hidden whitespace-nowrap px-1 group cursor-pointer border-l border-r border-blue-400 select-none z-10 print:whitespace-nowrap print:overflow-visible print:[text-shadow:0_1px_2px_rgb(0_0_0_/_80%)]",
        isResizing && "z-20 ring-2 ring-blue-400 opacity-90",
        className
      )}
      style={{ left: `${left}%`, width: `${width}%` }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onEdit(shift)
      }}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(e, shift)
        }
      }}
      title={`${formatDisplayTime(currentStartHour)} - ${formatDisplayTime(currentEndHour)}`}
    >
      {/* Left Handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-400/50 flex items-center justify-center"
        onMouseDown={(e) => startResize(e, 'left')}
      >
        <div className="w-0.5 h-3 bg-white/30 rounded-full" />
      </div>

      <span className="truncate px-2">
        {formatDisplayTime(currentStartHour)} - {formatDisplayTime(currentEndHour)}
      </span>

      {/* Right Handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-400/50 flex items-center justify-center"
        onMouseDown={(e) => startResize(e, 'right')}
      >
         <div className="w-0.5 h-3 bg-white/30 rounded-full" />
      </div>
    </div>
  )
}
