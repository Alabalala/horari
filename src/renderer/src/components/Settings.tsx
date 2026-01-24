import { useRef, useState, useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import { Upload, X, RefreshCw, Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

export default function Settings(): React.JSX.Element {
  const { settings, updateSetting, t } = useSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [updateStatus, setUpdateStatus] = useState<string>('idle')
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number>(0)
  const [appVersion, setAppVersion] = useState<string>('')

  useEffect(() => {
    window.api.utils.getAppVersion().then(setAppVersion)

    const removeListener = window.electron.ipcRenderer.on('updater-event', (_, data: any) => {
      if (data.type === 'checking') setUpdateStatus('checking')
      if (data.type === 'available') {
        setUpdateStatus('available')
        setUpdateInfo(data.info)
      }
      if (data.type === 'not-available') setUpdateStatus('up-to-date')
      if (data.type === 'error') {
        setUpdateStatus('error')
        setCheckError(data.error)
      }
      if (data.type === 'downloaded') {
        setUpdateStatus('downloaded')
        setUpdateInfo(data.info)
      }
      if (data.type === 'progress') {
        setUpdateStatus('downloading')
        setDownloadProgress(data.progress.percent)
      }
    })
    return () => {
        removeListener()
    }
  }, [])

  const checkForUpdates = async () => {
    setUpdateStatus('checking')
    setCheckError(null)
    await window.api.updater.check()
  }

  const downloadUpdate = async () => {
    await window.api.updater.download()
  }

  const installUpdate = async () => {
    await window.api.updater.install()
  }

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

        {/* Software Update */}
        <div className="bg-white dark:bg-slate-900/50 p-6 rounded-lg border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-200">
            {t('softwareUpdate') || 'Software Update'}
          </h2>
          
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:border-slate-800 pb-6">
             <div>
                <p className="text-slate-700 dark:text-slate-300 font-medium">{t('automaticUpdates') || 'Automatic Updates'}</p>
                <p className="text-sm text-slate-500">{t('automaticUpdatesDesc') || 'Download updates automatically when available'}</p>
             </div>
             <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.autoUpdate === 'true'}
                  onChange={(e) => updateSetting('autoUpdate', String(e.target.checked))}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
             </label>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
               <p className="text-slate-700 dark:text-slate-300 font-medium">{t('currentVersion') || 'Current Version'}</p>
               <p className="text-sm text-slate-500">v{appVersion}</p> 
            </div>
            
            <div className="flex items-center gap-3">
                {updateStatus === 'checking' && (
                    <span className="flex items-center text-sm text-slate-500">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('checkingForUpdates') || 'Checking...'}
                    </span>
                )}
                
                {updateStatus === 'up-to-date' && (
                    <span className="flex items-center text-sm text-green-600">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {t('upToDate') || 'Up to date'}
                    </span>
                )}

                {updateStatus === 'available' && (
                    <div className="flex items-center gap-3">
                         <span className="text-sm text-blue-600">
                            v{updateInfo?.version} {t('available') || 'available'}
                         </span>
                         <button 
                            onClick={downloadUpdate}
                            className="flex items-center px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                         >
                            <Download className="w-4 h-4 mr-2" />
                            {t('download') || 'Download'}
                         </button>
                    </div>
                )}
                
                {updateStatus === 'downloading' && (
                    <div className="flex flex-col items-end">
                         <span className="text-sm text-blue-600 mb-1">{t('downloading') || 'Downloading...'} {Math.floor(downloadProgress)}%</span>
                         <div className="w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${downloadProgress}%` }}></div>
                         </div>
                    </div>
                )}

                {updateStatus === 'downloaded' && (
                    <button 
                        onClick={installUpdate}
                        className="flex items-center px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
                     >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('restartAndInstall') || 'Restart & Install'}
                     </button>
                )}

                {updateStatus === 'error' && (
                    <span className="flex items-center text-sm text-red-600">
                        <AlertCircle className="w-4 h-4 mr-2" />
                        {t('updateError') || 'Error'}
                    </span>
                )}
                
                {(updateStatus === 'idle' || updateStatus === 'up-to-date' || updateStatus === 'error') && (
                    <button
                        onClick={checkForUpdates}
                        disabled={updateStatus === 'checking'}
                        className="flex items-center px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors text-slate-700 dark:text-slate-300"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        {t('checkForUpdates') || 'Check for updates'}
                    </button>
                )}
            </div>
          </div>
          {checkError && <p className="mt-2 text-xs text-red-500">{checkError}</p>}
        </div>
      </div>
    </div>
  )
}
