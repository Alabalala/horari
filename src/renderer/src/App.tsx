import { HashRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Employees from './components/Employees'
import EmployeeDetails from './components/EmployeeDetails'
import Shifts from './components/Shifts'
import Settings from './components/Settings'
import { SettingsProvider } from './contexts/SettingsContext'
import { useSettings } from './hooks/useSettings'

function Layout(): React.JSX.Element {
  const { settings } = useSettings()

  return (
    <div
      className={`flex h-screen w-screen ${settings.theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}
    >
      <Sidebar />
      <main className="ml-64 flex-1 overflow-auto px-8 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/employees/:id" element={<EmployeeDetails />} />
          <Route path="/shifts" element={<Shifts />} />
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
