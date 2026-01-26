import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Employees from './components/Employees'
import EmployeeDetails from './components/EmployeeDetails'
import Shifts from './components/Shifts'
import Reports from './components/Reports'
import Settings from './components/Settings'
import UpdateNotifier from './components/UpdateNotifier'
import { SettingsProvider } from './contexts/SettingsContext'
import { useSettings } from './hooks/useSettings'

function Layout(): React.JSX.Element {
  const { settings } = useSettings()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = window.innerWidth < 1024 // LG breakpoint
      setIsMobile(mobile)
      if (mobile) {
        setIsSidebarOpen(false)
      } else {
        setIsSidebarOpen(true)
      }
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  return (
    <div
      className={`flex h-screen w-screen ${settings.theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}
    >
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        isMobile={isMobile}
      />
      <main 
        className={`flex-1 overflow-auto px-8 py-6 transition-all duration-300 ${isMobile ? 'ml-0' : 'ml-64'}`}
      >
        {isMobile && (
          <div className="mb-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-md p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
              aria-label="Open Menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/employees/:id" element={<EmployeeDetails />} />
          <Route path="/shifts" element={<Shifts />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

function App(): React.JSX.Element {
  return (
    <SettingsProvider>
      <HashRouter>
        <Layout />
      </HashRouter>
    </SettingsProvider>
  )
}

export default App
