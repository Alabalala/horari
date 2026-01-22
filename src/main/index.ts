import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import {
  getEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getShifts,
  getAllShifts,
  addShift,
  updateShift,
  deleteShift,
  getEmployee,
  updateEmployeeOrder,
  getSettings,
  updateSetting,
  getMonthlyHours,
  setMonthlyHours
} from './db'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.horari.app')

  // Check for updates
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify()
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Employee CRUD
  try {
    ipcMain.handle('get-employees', () => {
      console.log('Handling get-employees')
      return getEmployees()
    })
    ipcMain.handle('add-employee', (_, employee) => {
      console.log('Handling add-employee', employee)
      return addEmployee(employee)
    })
    ipcMain.handle('update-employee', (_, { id, ...employee }) => {
      console.log('Handling update-employee', id)
      return updateEmployee(id, employee)
    })
    ipcMain.handle('delete-employee', (_, id) => {
      console.log('Handling delete-employee', id)
      return deleteEmployee(id)
    })
    ipcMain.handle('get-employee', (_, id) => {
      return getEmployee(id)
    })
    ipcMain.handle('update-employee-order', (_, { id, order }) => {
      return updateEmployeeOrder(id, order)
    })

    // Monthly Hours
    ipcMain.handle('get-monthly-hours', (_, { employeeId, month }) => {
      return getMonthlyHours(employeeId, month)
    })
    ipcMain.handle('set-monthly-hours', (_, { employeeId, month, hours }) => {
      return setMonthlyHours(employeeId, month, hours)
    })

    // Shift CRUD
    ipcMain.handle('get-shifts', (_, { employeeId, startDate, endDate }) => {
      return getShifts(employeeId, startDate, endDate)
    })
    ipcMain.handle('get-all-shifts', (_, { startDate, endDate }) => {
      return getAllShifts(startDate, endDate)
    })
    ipcMain.handle('add-shift', (_, shift) => {
      return addShift(shift)
    })
    ipcMain.handle('update-shift', (_, { id, ...shift }) => {
      return updateShift(id, shift)
    })
    ipcMain.handle('delete-shift', (_, id) => {
      return deleteShift(id)
    })

    // Settings
    ipcMain.handle('get-settings', () => {
      return getSettings()
    })
    ipcMain.handle('update-setting', (_, { key, value }) => {
      return updateSetting(key, value)
    })

    // Export
    ipcMain.handle('save-export', async (_, { data, filename }) => {
      try {
        const ext = filename.split('.').pop()
        const { filePath } = await dialog.showSaveDialog({
          defaultPath: filename,
          filters: [
            { name: ext.toUpperCase(), extensions: [ext] }
          ]
        })

        if (!filePath) return { canceled: true }
        
        // Remove header (data:image/png;base64, or data:application/pdf;base64,)
        const base64Data = data.replace(/^data:.*?;base64,/, "")
        const buffer = Buffer.from(base64Data, 'base64')
        
        await fs.writeFile(filePath, buffer)
        await shell.openPath(filePath)
        return { success: true, filePath }
      } catch (error) {
        console.error('Failed to save export:', error)
        throw error
      }
    })

    console.log('Employee and Shift IPC handlers registered')
  } catch (error) {
    console.error('Failed to register IPC handlers:', error)
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
