import { Edit2, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSettings } from '../hooks/useSettings'

interface ShiftContextMenuProps {
  x: number
  y: number
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

export default function ShiftContextMenu({ x, y, onEdit, onDelete, onClose }: ShiftContextMenuProps): React.JSX.Element {
  const { t } = useSettings()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    // Use mousedown to capture click before it triggers other things
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Adjust position if it goes off screen (simple version)
  // Ideally we would measure the window size.
  
  return (
    <div
      ref={ref}
      className="fixed z-[100] w-32 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-950"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          onEdit()
          onClose()
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
      >
        <Edit2 className="h-4 w-4" />
        {t('edit')}
      </button>
      <button
        onClick={() => {
          onDelete()
          onClose()
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
      >
        <Trash2 className="h-4 w-4" />
        {t('delete')}
      </button>
    </div>
  )
}
