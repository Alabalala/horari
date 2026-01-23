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
    get: (employeeId, startDate, endDate) =>
      ipcRenderer.invoke('get-shifts', { employeeId, startDate, endDate }),
    getAll: (startDate, endDate) => ipcRenderer.invoke('get-all-shifts', { startDate, endDate }),
    add: (shift) => ipcRenderer.invoke('add-shift', shift),
    update: (id, shift) => ipcRenderer.invoke('update-shift', { id, ...shift }),
    delete: (id) => ipcRenderer.invoke('delete-shift', id)
  },
  settings: {
    getAll: () => ipcRenderer.invoke('get-settings'),
    update: (key, value) => ipcRenderer.invoke('update-setting', { key, value })
  },
  utils: {
    saveExport: (data, filename) => ipcRenderer.invoke('save-export', { data, filename })
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
