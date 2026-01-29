import React from 'react'
import { X, Calendar, Sparkles } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { cn } from '../lib/utils'

interface ReleaseNote {
  version: string
  date: string
  notes: Record<string, string[]>
}

interface WhatsNewModalProps {
  isOpen: boolean
  onClose: () => void
  releaseNotes: ReleaseNote[]
}

export default function WhatsNewModal({ isOpen, onClose, releaseNotes }: WhatsNewModalProps): React.JSX.Element | null {
  const { settings } = useSettings()
  const language = settings.language || 'en'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {language === 'es' ? 'Novedades' : "What's New"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto p-6 space-y-8">
          {releaseNotes.map((release, index) => (
            <div key={release.version} className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-800">
               <div className={cn(
                   "absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900",
                   index === 0 ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
               )}></div>
               
               <div className="flex items-baseline justify-between mb-2">
                 <h3 className="text-lg font-bold text-slate-900 dark:text-white">v{release.version}</h3>
                 <div className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                    <Calendar className="h-3 w-3 mr-1" />
                    {release.date}
                 </div>
               </div>
               
               <ul className="space-y-2">
                 {(release.notes[language] || release.notes['en'] || []).map((note, i) => (
                   <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                     <span className="block h-1.5 w-1.5 mt-1.5 rounded-full bg-blue-400/50 shrink-0"></span>
                     {note}
                   </li>
                 ))}
               </ul>
            </div>
          ))}
        </div>
        
        <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {language === 'es' ? 'Entendido' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  )
}
