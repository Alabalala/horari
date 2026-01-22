import { useEffect, useState, ReactNode } from 'react'
import { Settings, SettingsContext } from './SettingsContextState'

const translations = {
  en: {
    dashboard: 'Dashboard',
    employees: 'Employees',
    settings: 'Settings',
    todaysCoverage: "Today's Coverage",
    coverageGaps: 'Coverage Gaps',
    noCoverage: 'No Coverage',
    covered: 'Covered',
    activeEmployees: 'Active Employees',
    totalEmployees: 'Total Employees',
    departments: 'Departments',
    shiftsToday: 'Shifts Today',
    noActiveEmployees: 'No active employees',
    addEmployee: 'Add Employee',
    editEmployee: 'Edit Employee',
    name: 'Name',
    role: 'Role',
    department: 'Department',
    status: 'Status',
    actions: 'Actions',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    confirmDelete: 'Are you sure you want to delete this?',
    employeeDetails: 'Employee Details',
    shifts: 'Shifts',
    addShift: 'Add Shift',
    editShift: 'Edit Shift',
    startTime: 'Start Time',
    endTime: 'End Time',
    companyName: 'Company Name',
    openingTime: 'Opening Time',
    closingTime: 'Closing Time',
    companyLogo: 'Company Logo',
    uploadLogo: 'Upload Logo',
    removeLogo: 'Remove Logo',
    language: 'Language',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    businessSettings: 'Business Settings',
    generalSettings: 'General Settings',
    english: 'English',
    spanish: 'Spanish',
    day: 'Day',
    week: 'Week',
    date: 'Date',
    dashboardOverview: 'Overview of your employee directory inside this Electron app.',
    statusActive: 'Active',
    statusInactive: 'Inactive',
    statusOnLeave: 'On Leave',
    placeholderName: 'John Doe',
    placeholderRole: 'Software Engineer',
    placeholderDepartment: 'Engineering',
    hours: 'hours',
    deleteShiftConfirm: 'Delete shift?',
    shiftsDescription: 'Manage and schedule shifts for all employees.',
    searchEmployees: 'Search employees...',
    allDepartments: 'All Departments',
    employee: 'Employee',
    manageTeamMembers: 'Manage your team members.',
    defaultMonthlyHours: 'Default Monthly Hours',
    failedToSaveEmployee: 'Failed to save employee',
    failedToDeleteEmployee: 'Failed to delete employee',
    internalDashboard: 'Internal dashboard',
    session: 'Session',
    runtimeDetails: 'Electron runtime details below.',
    failedToSaveShift: 'Failed to save shift',
    loading: 'Loading...',
    month: 'Month',
    worked: 'Worked',
    agreed: 'Agreed',
    diff: 'Diff',
    noShiftsForDay: 'No shifts scheduled for this day',
    weekOf: 'Week of',
    coverageGapsRed: 'Coverage Gaps (Red)',
    shiftOutsideBusinessHoursConfirm: 'Shift is outside business hours. Do you want to proceed?',
    shiftOverlapError: 'This shift overlaps with another shift for the same employee.',
    filterBy: 'Filter by',
    allStatuses: 'All Statuses',
    allRoles: 'All Roles',
    clearFilters: 'Clear filters',
    edit: 'Edit',
    fileSizeTooLarge: 'File size too large. Please upload an image smaller than 2MB.',
    fileSizeLimit: 'Max 2MB. PNG, JPG, SVG.',
    appLogoAlt: 'App Logo',
    confirm: 'Confirm',
    error: 'Error',
    deleteEmployee: 'Delete Employee',
    deleteShift: 'Delete Shift',
    total: 'Total',
    owed: 'Owed',
    generatedOn: 'Generated on',
    exportSchedule: 'Export Schedule',
    schedule: 'Schedule',
    print: 'Print',
    printSchedule: 'Print Schedule',
    totalStaff: 'Hours without staff',
    preview: 'Preview',
    weeklySchedule: 'Weekly Schedule'
  },
  es: {
    dashboard: 'Panel de control',
    employees: 'Empleados',
    settings: 'Configuración',
    todaysCoverage: 'Cobertura de hoy',
    coverageGaps: 'Brechas de cobertura',
    noCoverage: 'Sin cobertura',
    covered: 'Cubierto',
    activeEmployees: 'Empleados activos',
    totalEmployees: 'Total de empleados',
    departments: 'Departamentos',
    shiftsToday: 'Turnos de hoy',
    noActiveEmployees: 'No hay empleados activos',
    addEmployee: 'Añadir empleado',
    editEmployee: 'Editar empleado',
    name: 'Nombre',
    role: 'Rol',
    department: 'Departamento',
    status: 'Estado',
    actions: 'Acciones',
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    confirmDelete: '¿Estás seguro de que quieres eliminar esto?',
    employeeDetails: 'Detalles del empleado',
    shifts: 'Turnos',
    addShift: 'Añadir turno',
    editShift: 'Editar turno',
    startTime: 'Hora de inicio',
    endTime: 'Hora de fin',
    companyName: 'Nombre de la empresa',
    openingTime: 'Hora de apertura',
    closingTime: 'Hora de cierre',
    companyLogo: 'Logotipo de la empresa',
    uploadLogo: 'Subir logo',
    removeLogo: 'Eliminar logo',
    language: 'Idioma',
    theme: 'Tema',
    dark: 'Oscuro',
    light: 'Claro',
    businessSettings: 'Configuración del negocio',
    generalSettings: 'Configuración general',
    english: 'Inglés',
    spanish: 'Español',
    day: 'Día',
    week: 'Semana',
    date: 'Fecha',
    manageTeamMembers: 'Gestiona los miembros de tu equipo.',
    defaultMonthlyHours: 'Horas mensuales predeterminadas',
    failedToSaveEmployee: 'Error al guardar empleado',
    failedToDeleteEmployee: 'Error al eliminar empleado',
    placeholderName: 'Juan Pérez',
    placeholderRole: 'Ingeniero de Software',
    placeholderDepartment: 'Ingeniería',
    internalDashboard: 'Panel interno',
    session: 'Sesión',
    runtimeDetails: 'Detalles del tiempo de ejecución de Electron a continuación.',
    dashboardOverview: 'Resumen de su directorio de empleados dentro de esta aplicación Electron.',
    statusActive: 'Activo',
    statusInactive: 'Inactivo',
    statusOnLeave: 'De vacaciones',
    hours: 'horas',
    deleteShiftConfirm: '¿Eliminar turno?',
    failedToSaveShift: 'Error al guardar turno',
    loading: 'Cargando...',
    month: 'Mes',
    worked: 'Trabajado',
    agreed: 'Acordado',
    diff: 'Diferencia',
    noShiftsForDay: 'No hay turnos programados para este día',
    weekOf: 'Semana del',
    coverageGapsRed: 'Brechas de cobertura (Rojo)',
    shiftsDescription: 'Gestione y programe turnos para todos los empleados.',
    searchEmployees: 'Buscar empleados...',
    allDepartments: 'Todos los departamentos',
    employee: 'Empleado',
    shiftOutsideBusinessHoursConfirm: 'El turno está fuera del horario comercial. ¿Quieres continuar?',
    shiftOverlapError: 'Este turno se superpone con otro turno para el mismo empleado.',
    filterBy: 'Filtrar por',
    allStatuses: 'Todos los estados',
    allRoles: 'Todos los roles',
    clearFilters: 'Borrar filtros',
    edit: 'Editar',
    fileSizeTooLarge: 'El archivo es demasiado grande. Por favor, sube una imagen de menos de 2MB.',
    fileSizeLimit: 'Máx 2MB. PNG, JPG, SVG.',
    appLogoAlt: 'Logotipo de la aplicación',
    confirm: 'Confirmar',
    error: 'Error',
    deleteEmployee: 'Eliminar empleado',
    deleteShift: 'Eliminar turno',
    total: 'Total',
    owed: 'Debido',
    generatedOn: 'Generado el',
    exportSchedule: 'Exportar horario',
    schedule: 'Horario',
    totalStaff: 'Horas sin personal',
    print: 'Imprimir',
    printSchedule: 'Imprimir horario',
    preview: 'Vista previa',
    weeklySchedule: 'Horario Semanal'
  }
}

export function SettingsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>({
    language: 'en',
    theme: 'dark',
    companyName: 'My Company',
    companyLogo: '',
    openingTime: '08:00',
    closingTime: '20:00'
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(settings.theme)
  }, [settings.theme])

  const loadSettings = async (): Promise<void> => {
    try {
      const stored = await window.api.settings.getAll()
      // Merge with defaults to ensure all keys exist
      setSettings((prev) => ({ ...prev, ...stored }))
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateSetting = async (key: keyof Settings, value: string): Promise<void> => {
    try {
      // Optimistic update
      setSettings((prev) => ({ ...prev, [key]: value }))
      await window.api.settings.update(key, value)
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error)
      // Revert on error (could be improved)
      loadSettings()
    }
  }

  const t = (key: string): string => {
    const lang = settings.language as keyof typeof translations
    return translations[lang]?.[key] || key
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, t, isLoading }}>
      {children}
    </SettingsContext.Provider>
  )
}
