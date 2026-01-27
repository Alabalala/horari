import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { FileText, ChevronRight, Lock, Calendar, Download } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { MonthlyClosure, StoredEmployeeBalance } from '../lib/balanceUtils'
import { cn } from '../lib/utils'

export default function Reports(): React.JSX.Element {
  const { settings, t } = useSettings()
  const dateLocale = settings.language === 'es' ? es : undefined
  
  const [closures, setClosures] = useState<MonthlyClosure[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  
  useEffect(() => {
    fetchClosures()
  }, [])

  const fetchClosures = async () => {
    try {
      const data = await window.api.monthlyClosures.getAll()
      setClosures(data as MonthlyClosure[])
    } catch (error) {
      console.error('Failed to fetch monthly closures:', error)
    }
  }

  const selectedClosure = selectedMonth 
    ? closures.find(c => c.monthId === selectedMonth) 
    : null

  const balances: StoredEmployeeBalance[] = useMemo(() => {
    if (!selectedClosure) return []
    try {
      return JSON.parse(selectedClosure.balances)
    } catch (e) {
      console.error('Failed to parse balances for closure', selectedClosure.monthId, e)
      return []
    }
  }, [selectedClosure])

  const handleExportCSV = () => {
    if (!selectedClosure || !balances.length) return

    const headers = [
      t('employee') || 'Employee',
      t('targetHours') || 'Target Hours',
      t('actualHours') || 'Actual Hours (Total)',
      t('workedHours') || 'Worked Hours',
      t('paidAbsence') || 'Paid Absence',
      t('unpaidAbsence') || 'Unpaid Absence',
      t('payrollHours') || 'Payroll Hours (Billable)',
      t('difference') || 'Difference',
      t('accumulatedBalance') || 'Accumulated Balance'
    ]

    const rows = balances.map(b => {
        const worked = b.workedHours ?? b.actualHours // Fallback for old records
        const paid = b.paidAbsenceHours ?? 0
        const unpaid = b.unpaidAbsenceHours ?? 0
        const payroll = worked + paid

        return [
            `"${b.name}"`, 
            b.targetHours.toFixed(2),
            b.actualHours.toFixed(2),
            worked.toFixed(2),
            paid.toFixed(2),
            unpaid.toFixed(2),
            payroll.toFixed(2),
            b.monthlyDifference.toFixed(2),
            b.accumulatedBalance.toFixed(2)
        ]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `report-${selectedClosure.monthId}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          {t('reports') || 'Reports'}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t('reportsDescription') || 'View historical records of closed months and employee balances.'}
        </p>
      </header>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Sidebar List */}
        <div className="w-64 flex-shrink-0 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('closedMonths') || 'Closed Months'}
            </h2>
          </div>
          {closures.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {t('noClosedMonths') || 'No closed months found.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {closures.map(closure => {
                const date = parseISO(closure.monthId + '-01')
                const isSelected = selectedMonth === closure.monthId
                
                return (
                  <button
                    key={closure.monthId}
                    onClick={() => setSelectedMonth(closure.monthId)}
                    className={cn(
                      "flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
                      isSelected && "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    )}
                  >
                    <div>
                      <div className={cn(
                        "font-medium",
                        isSelected ? "text-blue-700 dark:text-blue-400" : "text-slate-900 dark:text-slate-200"
                      )}>
                        {format(date, 'MMMM yyyy', { locale: dateLocale })}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(closure.closedAt), 'P', { locale: dateLocale })}
                      </div>
                    </div>
                    <ChevronRight className={cn(
                      "h-4 w-4",
                      isSelected ? "text-blue-500" : "text-slate-400"
                    )} />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail View */}
        <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex flex-col">
          {selectedClosure ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 capitalize">
                    {format(parseISO(selectedClosure.monthId + '-01'), 'MMMM yyyy', { locale: dateLocale })}
                  </h2>
                  <div className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                      <Lock className="h-3 w-3" />
                      {t('closed') || 'Closed'}
                    </span>
                    <span>•</span>
                    <span>
                      {t('closedOn') || 'Closed on'} {format(parseISO(selectedClosure.closedAt), 'PPP p', { locale: dateLocale })}
                    </span>
                  </div>
                </div>
                <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors shadow-sm"
                    title={t('exportCSVDescription') || "Export to CSV (Excel compatible)"}
                >
                    <Download className="h-4 w-4" />
                    {t('exportCSV') || 'Export CSV'}
                </button>
              </div>

              <div className="flex-1 overflow-auto p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 sticky top-0">
                    <tr>
                      <th className="px-6 py-3">{t('employee') || 'Employee'}</th>
                      <th className="px-6 py-3 text-right">{t('targetHours') || 'Target Hours'}</th>
                      <th className="px-6 py-3 text-right">{t('actualHours') || 'Actual Hours'}</th>
                      <th className="px-6 py-3 text-right">{t('difference') || 'Difference'}</th>
                      <th className="px-6 py-3 text-right">{t('accumulatedBalance') || 'Accumulated Balance'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {balances.map(balance => (
                      <tr key={balance.employeeId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">
                          {balance.name}
                        </td>
                        <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400">
                          {balance.targetHours.toFixed(1)}
                        </td>
                        <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400">
                          {balance.actualHours.toFixed(1)}
                        </td>
                        <td className={cn(
                          "px-6 py-4 text-right font-medium",
                          balance.monthlyDifference > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                          balance.monthlyDifference < 0 ? "text-red-600 dark:text-red-400" : 
                          "text-slate-600 dark:text-slate-400"
                        )}>
                          {balance.monthlyDifference > 0 ? '+' : ''}{balance.monthlyDifference.toFixed(1)}
                        </td>
                        <td className={cn(
                          "px-6 py-4 text-right font-bold",
                          balance.accumulatedBalance > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                          balance.accumulatedBalance < 0 ? "text-red-600 dark:text-red-400" : 
                          "text-slate-600 dark:text-slate-400"
                        )}>
                          {balance.accumulatedBalance > 0 ? '+' : ''}{balance.accumulatedBalance.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-slate-400 dark:text-slate-500">
              <FileText className="h-12 w-12 mb-4 opacity-20" />
              <p>{t('selectMonthToView') || 'Select a month to view details'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
