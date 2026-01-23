import { useSettings } from '../hooks/useSettings'
import { Settings } from '../contexts/SettingsContextState'
import { Check } from 'lucide-react'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@renderer/lib/utils'

interface StatsVisibilityMenuProps {
  className?: string
}

export function StatsVisibilityMenu({ className }: StatsVisibilityMenuProps): React.JSX.Element {
  const { settings, updateSetting, t } = useSettings()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const toggleStat = (key: keyof Settings['visibleStats']) => {
    const current = settings.visibleStats
    const newValue = { ...current, [key]: !current[key] }
    updateSetting('visibleStats', newValue)
  }

  return (
    <div className={cn('relative', className)} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium text-slate-700 dark:text-slate-200"
      >
        {t('viewOptions') || 'View Options'}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-lg z-50 p-2">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 py-1 mb-1 uppercase tracking-wider">
            {t('visibleStats') || 'Visible Stats'}
          </div>
          <div className="space-y-1">
            {[
              { key: 'monthlyTarget', label: t('targetMonthly') || 'Monthly Target' },
              { key: 'weeklyTarget', label: t('targetWeekly') || 'Weekly Target' },
              { key: 'monthlyDiff', label: t('monthDiff') || 'Monthly Diff' },
              { key: 'weeklyDiff', label: t('weekDiff') || 'Weekly Diff' },
              { key: 'totalWorked', label: t('totalWorked') || 'Total Worked' },
              { key: 'lifetimeBalance', label: t('lifetimeBalance') || 'Lifetime Balance' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleStat(key as keyof Settings['visibleStats'])}
                className="w-full flex items-center justify-between px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-left"
              >
                <span>{label}</span>
                {settings.visibleStats[key as keyof Settings['visibleStats']] && (
                  <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
