import { useEffect, useState } from 'react'
import { Download, RefreshCw, X, AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export default function UpdateNotifier(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [progress, setProgress] = useState<number>(0)
  const [version, setVersion] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const removeListener = window.electron.ipcRenderer.on('updater-event', (_, data: any) => {
      console.log('Updater event:', data)
      
      switch (data.type) {
        case 'checking':
          // status is usually handled by the settings page, but we can track it
          break
        case 'available':
          setStatus('available')
          setVersion(data.info.version)
          setIsVisible(true)
          break
        case 'not-available':
          // handled by settings page usually
          break
        case 'progress':
          setStatus('downloading')
          setProgress(Math.floor(data.progress.percent))
          setIsVisible(true)
          break
        case 'downloaded':
          setStatus('downloaded')
          setVersion(data.info.version)
          setIsVisible(true)
          break
        case 'error':
          setStatus('error')
          setError(data.error)
          setIsVisible(true)
          // Auto hide error after 5 seconds
          setTimeout(() => setIsVisible(false), 5000)
          break
      }
    })

    return () => {
      removeListener()
    }
  }, [])

  const handleDownload = () => {
    window.api.updater.download()
  }

  const handleInstall = () => {
    window.api.updater.install()
  }

  const handleClose = () => {
    setIsVisible(false)
  }

  if (!isVisible || status === 'idle' || status === 'not-available' || status === 'checking') {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-4 animate-in slide-in-from-bottom-5">
      <button 
        onClick={handleClose}
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {status === 'available' && <AlertCircle className="w-5 h-5 text-blue-500" />}
          {status === 'downloading' && <Download className="w-5 h-5 text-blue-500 animate-bounce" />}
          {status === 'downloaded' && <CheckCircle className="w-5 h-5 text-green-500" />}
          {status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
        </div>

        <div className="flex-1">
          {status === 'available' && (
            <div>
              <h4 className="font-medium text-slate-900 dark:text-slate-100">Update Available</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Version {version} is available.
              </p>
              <button
                onClick={handleDownload}
                className="mt-3 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-medium transition-colors inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download Update
              </button>
            </div>
          )}

          {status === 'downloading' && (
            <div>
              <h4 className="font-medium text-slate-900 dark:text-slate-100">Downloading Update...</h4>
              <div className="mt-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-right">
                {progress}%
              </p>
            </div>
          )}

          {status === 'downloaded' && (
            <div>
              <h4 className="font-medium text-slate-900 dark:text-slate-100">Update Ready</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Version {version} has been downloaded.
              </p>
              <button
                onClick={handleInstall}
                className="mt-3 text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md font-medium transition-colors inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Restart & Install
              </button>
            </div>
          )}

          {status === 'error' && (
            <div>
              <h4 className="font-medium text-red-600">Update Failed</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {error || 'An error occurred while updating.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
