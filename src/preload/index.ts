import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  employees: {
    getAll: () => ipcRenderer.invoke('get-employees'),
    get: (id) => ipcRenderer.invoke('get-employee', id),
    add: (employee) => ipcRenderer.invoke('add-employee', employee),
    update: (id, employee) => ipcRenderer.invoke('update-employee', { id, ...employee }),
    updateOrder: (id, order) => ipcRenderer.invoke('update-employee-order', { id, order }),
    delete: (id) => ipcRenderer.invoke('delete-employee', id),
    getMonthlyHours: (employeeId, month) => ipcRenderer.invoke('get-monthly-hours', { employeeId, month }),
    setMonthlyHours: (employeeId, month, hours) => ipcRenderer.invoke('set-monthly-hours', { employeeId, month, hours }),
    getWeeklyHours: (employeeId, weekStart) => ipcRenderer.invoke('get-weekly-hours', { employeeId, weekStart }),
    getAllWeeklyHours: (weekStart) => ipcRenderer.invoke('get-all-weekly-hours', { weekStart }),
    setWeeklyHours: (employeeId, weekStart, hours) => ipcRenderer.invoke('set-weekly-hours', { employeeId, weekStart, hours })
  },
  shifts: {
    get: (employeeId, startDate, endDate, scenarioId) =>
      ipcRenderer.invoke('get-shifts', { employeeId, startDate, endDate, scenarioId }),
    getAll: (startDate, endDate, scenarioId) => ipcRenderer.invoke('get-all-shifts', { startDate, endDate, scenarioId }),
    add: (shift) => ipcRenderer.invoke('add-shift', shift),
    update: (id, shift) => ipcRenderer.invoke('update-shift', { id, ...shift }),
    delete: (id) => ipcRenderer.invoke('delete-shift', id),
    deleteByDateRange: (startDate, endDate, scenarioId) => ipcRenderer.invoke('delete-shifts-by-date-range', { startDate, endDate, scenarioId })
  },
  scenarios: {
    getAll: () => ipcRenderer.invoke('get-scenarios'),
    create: (name, description, startDate, endDate) => ipcRenderer.invoke('create-scenario', { name, description, startDate, endDate }),
    delete: (id) => ipcRenderer.invoke('delete-scenario', id),
    cloneLiveShifts: (scenarioId, startDate, endDate) => ipcRenderer.invoke('clone-live-shifts', { scenarioId, startDate, endDate }),
    publish: (scenarioId) => ipcRenderer.invoke('publish-scenario', scenarioId)
  },
  monthlyClosures: {
    get: (monthId) => ipcRenderer.invoke('get-monthly-closure', monthId),
    getAll: () => ipcRenderer.invoke('get-all-monthly-closures'),
    set: (closure) => ipcRenderer.invoke('set-monthly-closure', closure),
    delete: (monthId) => ipcRenderer.invoke('delete-monthly-closure', monthId)
  },
  balanceAdjustments: {
    get: (employeeId) => ipcRenderer.invoke('get-balance-adjustments', employeeId),
    add: (adjustment) => ipcRenderer.invoke('add-balance-adjustment', adjustment),
    delete: (id) => ipcRenderer.invoke('delete-balance-adjustment', id)
  },
  settings: {
    getAll: () => ipcRenderer.invoke('get-settings'),
    update: (key, value) => ipcRenderer.invoke('update-setting', { key, value })
  },
  updater: {
    check: () => ipcRenderer.invoke('check-for-updates'),
    download: () => ipcRenderer.invoke('start-download'),
    install: () => ipcRenderer.invoke('quit-and-install')
  },
  utils: {
    saveExport: (data, filename) => ipcRenderer.invoke('save-export', { data, filename }),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getReleaseNotes: () => ipcRenderer.invoke('get-release-notes')
  },
  backup: {
    create: () => ipcRenderer.invoke('create-backup'),
    list: () => ipcRenderer.invoke('get-backups'),
    restore: (filename) => ipcRenderer.invoke('restore-backup', filename)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
