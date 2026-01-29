import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { FileText, ChevronRight, Lock, Calendar, Download, Printer, Search, Users, Clock, CreditCard, TrendingUp, Banknote } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { MonthlyClosure, StoredEmployeeBalance } from '../lib/balanceUtils'
import { cn } from '../lib/utils'
import { BalanceAdjustment, Employee } from '../types'

export default function Reports(): React.JSX.Element {
  const { settings, t } = useSettings()
  const dateLocale = settings.language === 'es' ? es : undefined
  
  const [closures, setClosures] = useState<MonthlyClosure[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [viewMode, setViewMode] = useState<'closures' | 'adjustments'>('closures')
  const [adjustments, setAdjustments] = useState<BalanceAdjustment[]>([])
  const [employees, setEmployees] = useState<Record<number, Employee>>({})
  
  useEffect(() => {
    fetchClosures()
    fetchAdjustments()
    fetchEmployees()
  }, [])

  const fetchClosures = async () => {
    try {
      const data = await window.api.monthlyClosures.getAll()
      setClosures(data as MonthlyClosure[])
    } catch (error) {
      console.error('Failed to fetch monthly closures:', error)
    }
  }

  const fetchAdjustments = async () => {
    try {
        const data = await window.api.balanceAdjustments.get()
        setAdjustments(data as BalanceAdjustment[])
    } catch (error) {
        console.error('Failed to fetch adjustments:', error)
    }
  }

  const fetchEmployees = async () => {
      try {
          const data = await window.api.employees.getAll() as Employee[]
          const map: Record<number, Employee> = {}
          data.forEach(e => map[e.id] = e)
          setEmployees(map)
      } catch (error) {
          console.error('Failed to fetch employees:', error)
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

  const filteredBalances = useMemo(() => {
    if (!searchQuery) return balances
    const lowerQuery = searchQuery.toLowerCase()
    return balances.filter(b => b.name.toLowerCase().includes(lowerQuery))
  }, [balances, searchQuery])

  const filteredAdjustments = useMemo(() => {
    if (!searchQuery) return adjustments
    const lowerQuery = searchQuery.toLowerCase()
    return adjustments.filter(a => {
        const empName = employees[a.employeeId]?.name || ''
        return empName.toLowerCase().includes(lowerQuery)
    })
  }, [adjustments, searchQuery, employees])

  const stats = useMemo(() => {
    const totalEmployees = balances.length
    const totalWorked = balances.reduce((sum, b) => sum + (b.workedHours || b.actualHours || 0), 0)
    const totalPaidAbsence = balances.reduce((sum, b) => sum + (b.paidAbsenceHours || 0), 0)
    const totalPayroll = totalWorked + totalPaidAbsence
    const netBalanceChange = balances.reduce((sum, b) => sum + b.monthlyDifference, 0)

    return { totalEmployees, totalWorked, totalPaidAbsence, totalPayroll, netBalanceChange }
  }, [balances])

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
        const worked = b.workedHours ?? b.actualHours
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

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl flex-col gap-6 p-6 print:h-auto print:max-w-none print:p-0">
      <header className="print:hidden">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          {t('reports') || 'Reports'}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t('reportsDescription') || 'View historical records of closed months and employee balances.'}
        </p>
      </header>

      <div className="flex flex-1 gap-6 overflow-hidden print:overflow-visible print:block">
        {/* Sidebar List - Hidden in Print */}
        <div className="w-64 flex-shrink-0 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 print:hidden">
          {/* Other Reports Section */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t('viewOptions') || 'View Options'}
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800">
            <button
                onClick={() => setViewMode('adjustments')}
                className={cn(
                    "flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
                    viewMode === 'adjustments' && "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                )}
            >
                <div className="flex items-center gap-3">
                    <Banknote className={cn(
                        "h-5 w-5",
                        viewMode === 'adjustments' ? "text-blue-600 dark:text-blue-400" : "text-slate-400"
                    )} />
                    <div className={cn(
                        "font-medium",
                        viewMode === 'adjustments' ? "text-blue-700 dark:text-blue-400" : "text-slate-900 dark:text-slate-200"
                    )}>
                        {t('balancePayOff') || 'Balance Pay Offs'}
                    </div>
                </div>
                <ChevronRight className={cn(
                    "h-4 w-4",
                    viewMode === 'adjustments' ? "text-blue-500" : "text-slate-400"
                )} />
            </button>
          </div>

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
                const isSelected = viewMode === 'closures' && selectedMonth === closure.monthId
                
                return (
                  <button
                    key={closure.monthId}
                    onClick={() => {
                        setSelectedMonth(closure.monthId)
                        setViewMode('closures')
                    }}
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
        <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex flex-col print:border-none print:bg-transparent print:overflow-visible">
          {viewMode === 'adjustments' ? (
             <>
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-6 print:border-none print:p-0 print:mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {t('balancePayOff') || 'Balance Pay Offs'}
                  </h2>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {t('payOffHistory') || 'History of manual balance adjustments and payoffs.'}
                  </div>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                    <div className="relative mr-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input 
                            type="text"
                            placeholder={t('searchEmployees') || "Search employees..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 w-64 rounded-md border border-slate-200 bg-white px-9 py-1 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                        />
                    </div>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors shadow-sm dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700"
                        title={t('print') || "Print Report"}
                    >
                        <Printer className="h-4 w-4" />
                        {t('print') || 'Print'}
                    </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-0 print:overflow-visible">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 sticky top-0 print:static">
                    <tr>
                      <th className="px-6 py-3">{t('date') || 'Date'}</th>
                      <th className="px-6 py-3">{t('employee') || 'Employee'}</th>
                      <th className="px-6 py-3">{t('description') || 'Description'}</th>
                      <th className="px-6 py-3">{t('month') || 'Month Applied'}</th>
                      <th className="px-6 py-3 text-right">{t('balanceBefore') || 'Balance Before'}</th>
                      <th className="px-6 py-3 text-right">{t('amount') || 'Amount'}</th>
                      <th className="px-6 py-3 text-right">{t('balanceAfter') || 'Balance After'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredAdjustments.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                                {t('noAdjustments') || 'No adjustments found matching your criteria.'}
                            </td>
                        </tr>
                    ) : (
                        filteredAdjustments.map(adj => {
                            const emp = employees[adj.employeeId]
                            const date = parseISO(adj.createdAt)
                            const monthDate = parseISO(adj.monthId + '-01')
                            
                            // Safety checks
                            const amount = typeof adj.amount === 'number' && !isNaN(adj.amount) ? adj.amount : 0
                            const hasBalanceAfter = adj.balanceAfter !== undefined && adj.balanceAfter !== null && !isNaN(adj.balanceAfter)
                            const balanceAfter = hasBalanceAfter ? adj.balanceAfter : undefined
                            const balanceBefore = balanceAfter !== undefined ? balanceAfter - amount : undefined
                            
                            return (
                              <tr key={adj.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 print:hover:bg-transparent">
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {format(date, 'P p', { locale: dateLocale })}
                                </td>
                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">
                                  {emp?.name || 'Unknown Employee'}
                                </td>
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                                  {adj.description || '-'}
                                </td>
                                <td className="px-6 py-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {format(monthDate, 'MMMM yyyy', { locale: dateLocale })}
                                </td>
                                <td className={cn(
                                  "px-6 py-4 text-right font-medium",
                                  (balanceBefore || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                                  (balanceBefore || 0) < 0 ? "text-red-600 dark:text-red-400" : 
                                  "text-slate-600 dark:text-slate-400"
                                )}>
                                  {balanceBefore !== undefined ? ((balanceBefore > 0 ? '+' : '') + balanceBefore.toFixed(2)) : '-'}
                                </td>
                                <td className={cn(
                                  "px-6 py-4 text-right font-bold",
                                  amount > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                                  amount < 0 ? "text-red-600 dark:text-red-400" : 
                                  "text-slate-600 dark:text-slate-400"
                                )}>
                                  {amount > 0 ? '+' : ''}{amount.toFixed(2)}
                                </td>
                                <td className={cn(
                                  "px-6 py-4 text-right font-medium",
                                  (balanceAfter || 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                                  (balanceAfter || 0) < 0 ? "text-red-600 dark:text-red-400" : 
                                  "text-slate-600 dark:text-slate-400"
                                )}>
                                  {balanceAfter !== undefined ? ((balanceAfter > 0 ? '+' : '') + balanceAfter.toFixed(2)) : '-'}
                                </td>
                              </tr>
                            )
                        })
                    )}
                  </tbody>
                </table>
              </div>
             </>
          ) : selectedClosure ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-6 print:border-none print:p-0 print:mb-6">
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
                <div className="flex items-center gap-2 print:hidden">
                    <div className="relative mr-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input 
                            type="text"
                            placeholder={t('searchEmployees') || "Search employees..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 w-64 rounded-md border border-slate-200 bg-white px-9 py-1 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                        />
                    </div>
                    <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors shadow-sm dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700"
                        title={t('print') || "Print Report"}
                    >
                        <Printer className="h-4 w-4" />
                        {t('print') || 'Print'}
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors shadow-sm"
                        title={t('exportCSVDescription') || "Export to CSV (Excel compatible)"}
                    >
                        <Download className="h-4 w-4" />
                        {t('exportCSV') || 'Export CSV'}
                    </button>
                </div>
              </div>

              {/* Summary Stats Cards */}
              <div className="grid grid-cols-4 gap-4 p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 print:grid-cols-4 print:gap-4 print:p-0 print:mb-6 print:border-none print:bg-transparent">
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 print:border print:border-slate-200">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                        <Users className="h-4 w-4" />
                        {t('totalEmployees') || 'Employees'}
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
                        {stats.totalEmployees}
                    </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 print:border print:border-slate-200">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                        <Clock className="h-4 w-4" />
                        {t('totalWorked') || 'Total Worked'}
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
                        {stats.totalWorked.toFixed(1)} <span className="text-sm font-normal text-slate-500">h</span>
                    </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 print:border print:border-slate-200">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                        <CreditCard className="h-4 w-4" />
                        {t('payrollHours') || 'Payroll Hours'}
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
                        {stats.totalPayroll.toFixed(1)} <span className="text-sm font-normal text-slate-500">h</span>
                    </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 print:border print:border-slate-200">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                        <TrendingUp className="h-4 w-4" />
                        {t('netBalance') || 'Net Balance'}
                    </div>
                    <div className={cn(
                        "mt-2 text-2xl font-semibold",
                        stats.netBalanceChange > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                        stats.netBalanceChange < 0 ? "text-red-600 dark:text-red-400" : 
                        "text-slate-900 dark:text-slate-50"
                    )}>
                        {stats.netBalanceChange > 0 ? '+' : ''}{stats.netBalanceChange.toFixed(1)} <span className="text-sm font-normal text-slate-500">h</span>
                    </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-0 print:overflow-visible">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-xs font-medium uppercase text-slate-500 dark:text-slate-400 sticky top-0 print:static">
                    <tr>
                      <th className="px-6 py-3">{t('employee') || 'Employee'}</th>
                      <th className="px-6 py-3 text-right">{t('targetHours') || 'Target'}</th>
                      <th className="px-6 py-3 text-right">{t('workedHours') || 'Worked'}</th>
                      <th className="px-6 py-3 text-right">{t('paidAbsence') || 'Paid Abs.'}</th>
                      <th className="px-6 py-3 text-right">{t('payrollHours') || 'Payroll'}</th>
                      <th className="px-6 py-3 text-right">{t('difference') || 'Diff'}</th>
                      <th className="px-6 py-3 text-right">{t('accumulatedBalance') || 'Balance'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredBalances.map(balance => {
                        const worked = balance.workedHours ?? balance.actualHours
                        const paid = balance.paidAbsenceHours ?? 0
                        const payroll = worked + paid
                        
                        return (
                          <tr key={balance.employeeId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 print:hover:bg-transparent">
                            <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">
                              {balance.name}
                            </td>
                            <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400">
                              {balance.targetHours.toFixed(1)}
                            </td>
                            <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400">
                              {worked.toFixed(1)}
                            </td>
                            <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-500">
                              {paid > 0 ? paid.toFixed(1) : '-'}
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-slate-900 dark:text-slate-200">
                              {payroll.toFixed(1)}
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
                        )
                    })}
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
