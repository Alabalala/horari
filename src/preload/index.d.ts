import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      employees: {
        getAll: () => Promise<unknown[]>
        get: (id: number) => Promise<unknown>
        add: (employee: {
          name: string
          role: string
          department: string
          status: string
          defaultHours?: number
          displayOrder?: number
          initialBalance?: number
        }) => Promise<void>
        update: (
          id: number,
          employee: {
            name: string
            role: string
            department: string
            status: string
            defaultHours?: number
            displayOrder?: number
            initialBalance?: number
          }
        ) => Promise<void>
        updateOrder: (id: number, order: number) => Promise<void>
        delete: (id: number) => Promise<void>
        getMonthlyHours: (employeeId: number, month: string) => Promise<number | undefined>
        setMonthlyHours: (employeeId: number, month: string, hours: number) => Promise<void>
        getWeeklyHours: (employeeId: number, weekStart: string) => Promise<number | undefined>
        getAllWeeklyHours: (weekStart: string) => Promise<{ employeeId: number; hours: number }[]>
        setWeeklyHours: (employeeId: number, weekStart: string, hours: number) => Promise<void>
      }
      shifts: {
        get: (employeeId: number, startDate?: string, endDate?: string, scenarioId?: string | null) => Promise<unknown[]>
        getAll: (startDate?: string, endDate?: string, scenarioId?: string | null) => Promise<unknown[]>
        add: (shift: { 
          employeeId: number
          startTime: string
          endTime: string
          type?: 'work' | 'absence'
          absenceType?: string
          isPaid?: boolean
          scenarioId?: string | null
        }) => Promise<void>
        update: (
          id: number,
          shift: { 
            employeeId: number
            startTime: string
            endTime: string
            type?: 'work' | 'absence'
            absenceType?: string
            isPaid?: boolean
            scenarioId?: string | null
          }
        ) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      scenarios: {
        getAll: () => Promise<unknown[]>
        create: (name: string, description: string | undefined, startDate: string, endDate: string) => Promise<{ id: string, name: string, createdAt: string, description?: string, startDate: string, endDate: string }>
        delete: (id: string) => Promise<void>
        cloneLiveShifts: (scenarioId: string, startDate: string, endDate: string) => Promise<void>
        publish: (scenarioId: string) => Promise<void>
      }
      monthlyClosures: {
        get: (monthId: string) => Promise<unknown | undefined>
        getAll: () => Promise<unknown[]>
        set: (closure: {
          monthId: string
          status: 'LOCKED' | 'OPEN'
          closedAt: string
          balances: string
        }) => Promise<void>
        delete: (monthId: string) => Promise<void>
      }
      balanceAdjustments: {
        get: (employeeId?: number) => Promise<unknown[]>
        add: (adjustment: {
          employeeId: number
          monthId: string
          amount: number
          description: string
          createdAt: string
          balanceAfter?: number
        }) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      settings: {
        getAll: () => Promise<Record<string, string>>
        update: (key: string, value: string) => Promise<void>
      }
      updater: {
        check: () => Promise<any>
        download: () => Promise<any>
        install: () => Promise<void>
      }
      utils: {
        saveExport: (data: string, filename: string) => Promise<{ success: boolean; filePath?: string; canceled?: boolean }>
        getAppVersion: () => Promise<string>
        getReleaseNotes: () => Promise<Array<{ version: string; date: string; notes: Record<string, string[]> }> | null>
      }
      backup: {
        create: () => Promise<{ filename: string; date: string; size: number }>
        list: () => Promise<Array<{ filename: string; date: string; size: number }>>
        restore: (filename: string) => Promise<void>
      }
    }
  }
}
