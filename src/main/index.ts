import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, dirname, basename } from 'path'
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
  setMonthlyHours,
  getWeeklyHours,
  getAllWeeklyHours,
  setWeeklyHours
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
    const settings = getSettings()
    autoUpdater.autoDownload = settings.autoUpdate === 'true'
    autoUpdater.checkForUpdatesAndNotify()
  }

  // Auto Updater Events
  autoUpdater.on('checking-for-update', () => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('updater-event', { type: 'checking' })
    })
  })

  autoUpdater.on('update-available', (info) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('updater-event', { type: 'available', info })
    })
  })

  autoUpdater.on('update-not-available', () => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('updater-event', { type: 'not-available' })
    })
  })

  autoUpdater.on('error', (err) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('updater-event', { type: 'error', error: err.message })
    })
  })

  autoUpdater.on('download-progress', (progressObj) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('updater-event', { type: 'progress', progress: progressObj })
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('updater-event', { type: 'downloaded', info })
    })
  })

  // Auto Updater IPC
  ipcMain.handle('check-for-updates', () => {
    return autoUpdater.checkForUpdates()
  })

  ipcMain.handle('start-download', () => {
    return autoUpdater.downloadUpdate()
  })

  ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

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

    // Weekly Hours
    ipcMain.handle('get-weekly-hours', (_, { employeeId, weekStart }) => {
      return getWeeklyHours(employeeId, weekStart)
    })
    ipcMain.handle('get-all-weekly-hours', (_, { weekStart }) => {
      return getAllWeeklyHours(weekStart)
    })
    ipcMain.handle('set-weekly-hours', (_, { employeeId, weekStart, hours }) => {
      return setWeeklyHours(employeeId, weekStart, hours)
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
      if (key === 'autoUpdate') {
        autoUpdater.autoDownload = value === 'true'
      }
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
        
        if (Array.isArray(data)) {
            // Handle multiple files
            const dir = dirname(filePath)
            const baseName = basename(filePath, `.${ext}`)
            
            for (let i = 0; i < data.length; i++) {
                const partData = data[i]
                const partFilename = `${baseName}-${i + 1}.${ext}`
                const partPath = join(dir, partFilename)
                
                const base64Data = partData.replace(/^data:.*?;base64,/, "")
                const buffer = Buffer.from(base64Data, 'base64')
                await fs.writeFile(partPath, buffer)
            }
            // Open the directory instead of the file
            await shell.openPath(dir)
            return { success: true, filePath: dir }
        } else {
            // Remove header (data:image/png;base64, or data:application/pdf;base64,)
            const base64Data = data.replace(/^data:.*?;base64,/, "")
            const buffer = Buffer.from(base64Data, 'base64')
            
            await fs.writeFile(filePath, buffer)
            await shell.openPath(filePath)
            return { success: true, filePath }
        }
      } catch (error) {
        console.error('Failed to save export:', error)
        throw error
      }
    })

    ipcMain.handle('get-app-version', () => {
      return app.getVersion()
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
