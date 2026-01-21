import { createContext } from 'react'

export type Settings = {
  language: 'en' | 'es'
  theme: 'dark' | 'light'
  companyName: string
  companyLogo?: string
  openingTime: string
  closingTime: string
}

export type SettingsContextType = {
  settings: Settings
  updateSetting: (key: keyof Settings, value: string) => Promise<void>
  t: (key: string) => string
  isLoading: boolean
}

export const SettingsContext = createContext<SettingsContextType | undefined>(undefined)
