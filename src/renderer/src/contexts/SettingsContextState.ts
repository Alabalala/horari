import { createContext } from 'react'

export type Settings = {
  language: 'en' | 'es'
  theme: 'dark' | 'light'
  companyName: string
  companyLogo?: string
  openingTime: string
  closingTime: string
  autoUpdate?: string
  showSidebarCalendar?: string
  visibleStats: {
    monthlyTarget: boolean
    weeklyTarget: boolean
    monthlyDiff: boolean
    weeklyDiff: boolean
    totalWorked: boolean
    lifetimeBalance: boolean
  }
}

export type SettingsContextType = {
  settings: Settings
  updateSetting: (key: keyof Settings, value: any) => Promise<void>
  t: (key: string) => string
  isLoading: boolean
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined)
