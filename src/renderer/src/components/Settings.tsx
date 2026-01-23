import { useRef } from 'react'
import { useSettings } from '../hooks/useSettings'
import { Upload, X } from 'lucide-react'

export default function Settings(): React.JSX.Element {
  const { settings, updateSetting, t } = useSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert(t('fileSizeTooLarge'))
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64String = reader.result as string
      updateSetting('companyLogo', base64String)
    }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => {
    updateSetting('companyLogo', '')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }


  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div className="space-y-6">
        {/* General Settings */}
        <div className="bg-white dark:bg-slate-900/50 p-6 rounded-lg border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">
            {t('generalSettings')}
          </h2>

          <div className="space-y-4">
            {/* Language */}
            <div className="flex items-center justify-between">
              <label className="text-slate-700 dark:text-slate-300">{t('language')}</label>
              <select
                value={settings.language}
                onChange={(e) => updateSetting('language', e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="en">{t('english')}</option>
                <option value="es">{t('spanish')}</option>
              </select>
            </div>

            {/* Theme */}
            <div className="flex items-center justify-between">
              <label className="text-slate-700 dark:text-slate-300">{t('theme')}</label>
              <select
                value={settings.theme}
                onChange={(e) => updateSetting('theme', e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded pl-3 pr-8 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="dark" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">{t('dark')}</option>
                <option value="light" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">{t('light')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Business Settings */}
        <div className="bg-white dark:bg-slate-900/50 p-6 rounded-lg border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">
            {t('businessSettings')}
          </h2>

          <div className="space-y-4">
            {/* Company Name */}
            <div className="space-y-2">
              <label className="text-slate-700 dark:text-slate-300">{t('companyName')}</label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => updateSetting('companyName', e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Company Logo */}
            <div className="space-y-2">
              <label className="text-slate-700 dark:text-slate-300">{t('companyLogo')}</label>
              <div className="flex items-center gap-4">
                {settings.companyLogo ? (
                  <div className="relative h-16 w-16 rounded-lg border border-slate-200 dark:border-slate-800 bg-white p-2">
                    <img 
                      src={settings.companyLogo} 
                      alt={t('companyLogoAlt')} 
                      className="h-full w-full object-contain"
                    />
                    <button
                      onClick={removeLogo}
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                      title={t('removeLogo')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <Upload className="h-6 w-6 text-slate-400" />
                  </div>
                )}
                
                <div className="flex flex-col gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    {t('uploadLogo')}
                  </button>
                  <p className="text-xs text-slate-500">
                    {t('fileSizeLimit')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Opening Time */}
              <div className="space-y-2">
                <label className="text-slate-700 dark:text-slate-300">{t('openingTime')}</label>
                <input
                  type="time"
                  value={settings.openingTime}
                  onChange={(e) => updateSetting('openingTime', e.target.value)}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Closing Time */}
              <div className="space-y-2">
                <label className="text-slate-700 dark:text-slate-300">{t('closingTime')}</label>
                <input
                  type="time"
                  value={settings.closingTime}
                  onChange={(e) => updateSetting('closingTime', e.target.value)}
                  className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
