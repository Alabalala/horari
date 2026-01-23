import { LayoutDashboard, Users, Settings, Calendar, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { cn } from '@renderer/lib/utils'
import { useSettings } from '../hooks/useSettings'
import logo from '../assets/logo.png'

type SidebarItemProps = {
  icon: React.ReactNode
  label: string
  to: string
  onClick?: () => void
}

function SidebarItem({ icon, label, to, onClick }: SidebarItemProps): React.JSX.Element {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white',

          isActive && 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
        )
      }
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-200 dark:bg-slate-900/60 text-slate-700 dark:text-slate-200">
        {icon}
      </span>
      <span>{label}</span>
    </NavLink>
  )
}

type SidebarProps = {
  isOpen: boolean
  onClose: () => void
  isMobile: boolean
}

function Sidebar({ isOpen, onClose, isMobile }: SidebarProps): React.JSX.Element {
  const { settings, t } = useSettings()

  // Overlay for mobile
  if (isMobile && !isOpen) return <></>

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-4 transition-transform duration-300 ease-in-out",
          // Mobile: slide in/out
          isMobile && !isOpen && "-translate-x-full",
          isMobile && isOpen && "translate-x-0",
          // Desktop: always visible (controlled by parent layout mostly, but here just fixed)
          !isMobile && "translate-x-0"
        )}
      >
        <div className="mb-8 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <img 
              src={settings.companyLogo || logo} 
              alt={t('appLogoAlt')} 
              className="h-8 w-8 object-contain"
            />
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {settings.companyName}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{t('internalDashboard')}</div>
            </div>
          </div>
          {isMobile && (
            <button 
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-1">
          <SidebarItem 
            icon={<LayoutDashboard className="h-4 w-4" />} 
            label={t('dashboard')} 
            to="/" 
            onClick={isMobile ? onClose : undefined}
          />
          <SidebarItem 
            icon={<Calendar className="h-4 w-4" />} 
            label={t('shifts')} 
            to="/shifts" 
            onClick={isMobile ? onClose : undefined}
          />
          <SidebarItem 
            icon={<Users className="h-4 w-4" />} 
            label={t('employees')} 
            to="/employees" 
            onClick={isMobile ? onClose : undefined}
          />
          <SidebarItem 
            icon={<Settings className="h-4 w-4" />} 
            label={t('settings')} 
            to="/settings" 
            onClick={isMobile ? onClose : undefined}
          />
        </nav>

        <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs text-slate-500">
          <div className="font-medium text-slate-600 dark:text-slate-300">{t('session')}</div>
          <div className="mt-1 text-slate-500">{t('runtimeDetails')}</div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
