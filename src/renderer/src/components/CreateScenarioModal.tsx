
import React, { useState } from 'react'
import { X, Copy } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { startOfWeek, endOfWeek, addWeeks, format } from 'date-fns'

interface CreateScenarioModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, startDate: string, endDate: string, description: string, cloneFromLive: boolean) => Promise<void>
}

export default function CreateScenarioModal({ isOpen, onClose, onCreate }: CreateScenarioModalProps) {
  const { t } = useSettings()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState(format(startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [cloneFromLive, setCloneFromLive] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onCreate(name, startDate, endDate, description, cloneFromLive)
      onClose()
      setName('')
      setDescription('')
      setCloneFromLive(false)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {t('createScenario') || 'Create Draft Scenario'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('scenarioName') || 'Scenario Name'}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              placeholder={t('scenarioNamePlaceholder') || "e.g., Next Week Plan"}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('startDate') || 'Start Date'}
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('endDate') || 'End Date'}
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('description') || 'Description'}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              rows={3}
            />
          </div>

          <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cloneFromLive"
                checked={cloneFromLive}
                onChange={(e) => setCloneFromLive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="cloneFromLive" className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Copy className="h-4 w-4" />
                {t('cloneFromLive') || 'Clone shifts from Live Roster'}
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t('cloneFromLiveHelp') || 'Copies all shifts from the live roster within the selected date range to this draft scenario.'}
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {t('cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? (t('creating') || 'Creating...') : (t('create') || 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
