import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  differenceInMinutes,
  parseISO,
  isSameMonth,
  format,
  subMonths,
  addDays,
  isSameDay,
  addMonths
} from 'date-fns'
import { Employee, Shift, BalanceAdjustment } from '../types'

export interface MonthlyClosure {
  monthId: string
  status: 'LOCKED' | 'OPEN'
  closedAt: string
  balances: string // JSON string of StoredEmployeeBalance[]
}

export interface StoredEmployeeBalance {
  employeeId: number
  name: string
  targetHours: number
  actualHours: number
  monthlyDifference: number
  accumulatedBalance: number
  workedHours?: number
  paidAbsenceHours?: number
  unpaidAbsenceHours?: number
}

// Helper to get applicable weekly hours for a specific day
const getDailyLiability = (
  date: Date,
  employee: Employee,
  weeklyHoursOverrides: Record<string, Record<number, number>>
): number => {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  const weekStr = weekStart.toISOString()

  let weeklyHours = employee.defaultHours ?? 40
  if (weeklyHoursOverrides[weekStr] && weeklyHoursOverrides[weekStr][employee.id] !== undefined) {
    weeklyHours = weeklyHoursOverrides[weekStr][employee.id]
  }

  return weeklyHours / 7
}

// Target and actual hours for one employee over a full calendar month
const computeMonthTargetActual = (
  mDate: Date,
  employee: Employee,
  allShifts: Shift[],
  weeklyHoursOverrides: Record<string, Record<number, number>>
): { target: number; actual: number } => {
  const mStart = startOfMonth(mDate)
  const mEnd = endOfMonth(mDate)
  const daysInMonth = eachDayOfInterval({ start: mStart, end: mEnd })

  let target = 0
  daysInMonth.forEach(day => {
    target += getDailyLiability(day, employee, weeklyHoursOverrides)
  })

  const empShifts = allShifts.filter(s => {
    if (s.employeeId !== employee.id) return false
    const sStart = parseISO(s.startTime)
    return sStart >= mStart && sStart <= mEnd
  })

  const actual = empShifts.reduce((sum, s) => {
    const start = parseISO(s.startTime)
    let end = parseISO(s.endTime)
    if (end < start) end = addDays(end, 1)
    return sum + (differenceInMinutes(end, start) / 60)
  }, 0)

  return { target, actual }
}

// Worked/paid-absence/unpaid-absence breakdown for one employee on a single day
const getDayActuals = (
  day: Date,
  employeeId: number,
  allShifts: Shift[]
): { worked: number; paidAbsence: number; unpaidAbsence: number } => {
  let worked = 0
  let paidAbsence = 0
  let unpaidAbsence = 0

  allShifts
    .filter(s => s.employeeId === employeeId && isSameDay(parseISO(s.startTime), day))
    .forEach(s => {
      const start = parseISO(s.startTime)
      let end = parseISO(s.endTime)
      if (end < start) end = addDays(end, 1)
      const hours = differenceInMinutes(end, start) / 60

      if (s.type === 'absence') {
        if (s.isPaid === false) unpaidAbsence += hours
        else paidAbsence += hours
      } else {
        worked += hours
      }
    })

  return { worked, paidAbsence, unpaidAbsence }
}

export interface DayBreakdown {
  date: string
  target: number
  worked: number
  paidAbsence: number
  unpaidAbsence: number
  actual: number
  diff: number
}

export interface WeekBreakdown {
  weekStart: string
  days: DayBreakdown[]
  target: number
  actual: number
  diff: number
}

export interface MonthSummary {
  monthId: string
  target: number
  actual: number
  diff: number
}

export interface EmployeeBreakdown {
  employeeId: number
  startingBalance: number
  priorMonths: MonthSummary[]
  currentMonth: {
    monthId: string
    weeks: WeekBreakdown[]
    target: number
    actual: number
    adjustments: number
    diff: number
  }
  accumulatedBalance: number
}

// Full breakdown for one employee: where the accumulated balance comes from
// (prior closed/open months) plus a week-by-week, day-by-day detail of the target month.
export const calculateEmployeeBreakdown = (
  targetMonth: Date,
  employee: Employee,
  allShifts: Shift[],
  monthlyClosures: MonthlyClosure[],
  weeklyHoursOverrides: Record<string, Record<number, number>>,
  balanceAdjustments: BalanceAdjustment[] = [],
  // Cut the target month's detail off at this date (e.g. "how do we stand as of today"),
  // instead of always counting the whole month including days that haven't happened yet.
  asOfDate?: Date
): EmployeeBreakdown => {
  const monthId = format(targetMonth, 'yyyy-MM')
  const prevMonthDate = subMonths(targetMonth, 1)
  const prevMonthId = format(prevMonthDate, 'yyyy-MM')

  let startingBalance = employee.initialBalance || 0
  const priorMonths: MonthSummary[] = []

  const prevClosure = monthlyClosures.find(c => c.monthId === prevMonthId && c.status === 'LOCKED')

  if (prevClosure) {
    try {
      const parsed = JSON.parse(prevClosure.balances) as StoredEmployeeBalance[]
      const mine = parsed.find(b => b.employeeId === employee.id)
      if (mine) startingBalance = mine.accumulatedBalance
    } catch (e) {
      console.error('Failed to parse previous month balances', e)
    }
  } else {
    const sortedClosures = [...monthlyClosures]
      .filter(c => c.status === 'LOCKED' && c.monthId < monthId)
      .sort((a, b) => b.monthId.localeCompare(a.monthId))
    const latestClosure = sortedClosures[0]

    if (latestClosure) {
      try {
        const parsed = JSON.parse(latestClosure.balances) as StoredEmployeeBalance[]
        const mine = parsed.find(b => b.employeeId === employee.id)
        if (mine) startingBalance = mine.accumulatedBalance
      } catch (e) {
        console.error('Failed to parse latest closure', e)
      }
    }

    let gapStart = latestClosure
      ? startOfMonth(addDays(parseISO(latestClosure.monthId + '-01'), 32))
      : undefined

    const hasAnyClosures = monthlyClosures.some(c => c.status === 'LOCKED')

    if (!gapStart && !hasAnyClosures) {
      const employeeShifts = allShifts.filter(s => s.employeeId === employee.id)
      if (employeeShifts.length > 0) {
        const sorted = [...employeeShifts].sort((a, b) => a.startTime.localeCompare(b.startTime))
        gapStart = startOfMonth(parseISO(sorted[0].startTime))
      }
    }

    if (gapStart && gapStart < targetMonth) {
      let curr = gapStart
      while (curr <= prevMonthDate) {
        const mId = format(curr, 'yyyy-MM')
        const { target, actual } = computeMonthTargetActual(curr, employee, allShifts, weeklyHoursOverrides)
        const adjustments = balanceAdjustments
          .filter(a => a.employeeId === employee.id && a.monthId === mId)
          .reduce((sum, a) => sum + a.amount, 0)
        const diff = actual - target + adjustments

        priorMonths.push({
          monthId: mId,
          target: Number(target.toFixed(2)),
          actual: Number(actual.toFixed(2)),
          diff: Number(diff.toFixed(2))
        })

        startingBalance += diff
        curr = addMonths(curr, 1)
      }
    }
  }

  // Week-by-week / day-by-day detail for the target month
  const mStart = startOfMonth(targetMonth)
  const mEnd = endOfMonth(targetMonth)
  const effectiveEnd = asOfDate ? (asOfDate < mStart ? mStart : asOfDate > mEnd ? mEnd : asOfDate) : mEnd
  const daysInMonth = eachDayOfInterval({ start: mStart, end: effectiveEnd })

  const weeksMap = new Map<string, DayBreakdown[]>()

  daysInMonth.forEach(day => {
    const target = getDailyLiability(day, employee, weeklyHoursOverrides)
    const { worked, paidAbsence, unpaidAbsence } = getDayActuals(day, employee.id, allShifts)
    const actual = worked + paidAbsence + unpaidAbsence

    const dayBreak: DayBreakdown = {
      date: format(day, 'yyyy-MM-dd'),
      target: Number(target.toFixed(2)),
      worked: Number(worked.toFixed(2)),
      paidAbsence: Number(paidAbsence.toFixed(2)),
      unpaidAbsence: Number(unpaidAbsence.toFixed(2)),
      actual: Number(actual.toFixed(2)),
      diff: Number((actual - target).toFixed(2))
    }

    const weekStart = startOfWeek(day, { weekStartsOn: 1 }).toISOString()
    if (!weeksMap.has(weekStart)) weeksMap.set(weekStart, [])
    weeksMap.get(weekStart)!.push(dayBreak)
  })

  const weeks: WeekBreakdown[] = Array.from(weeksMap.entries()).map(([weekStart, days]) => {
    const target = days.reduce((s, d) => s + d.target, 0)
    const actual = days.reduce((s, d) => s + d.actual, 0)
    return {
      weekStart,
      days,
      target: Number(target.toFixed(2)),
      actual: Number(actual.toFixed(2)),
      diff: Number((actual - target).toFixed(2))
    }
  })

  const currentTarget = weeks.reduce((s, w) => s + w.target, 0)
  const currentActual = weeks.reduce((s, w) => s + w.actual, 0)
  const currentAdjustments = balanceAdjustments
    .filter(a => a.employeeId === employee.id && a.monthId === monthId)
    .reduce((sum, a) => sum + a.amount, 0)
  const currentDiff = currentActual - currentTarget + currentAdjustments

  return {
    employeeId: employee.id,
    startingBalance: Number(startingBalance.toFixed(2)),
    priorMonths,
    currentMonth: {
      monthId,
      weeks,
      target: Number(currentTarget.toFixed(2)),
      actual: Number(currentActual.toFixed(2)),
      adjustments: Number(currentAdjustments.toFixed(2)),
      diff: Number(currentDiff.toFixed(2))
    },
    accumulatedBalance: Number((startingBalance + currentDiff).toFixed(2))
  }
}

export const calculateMonthStats = (
  targetMonth: Date,
  employees: Employee[],
  allShifts: Shift[], // Should contain enough shifts (at least for the calculation window)
  monthlyClosures: MonthlyClosure[],
  weeklyHoursOverrides: Record<string, Record<number, number>>,
  balanceAdjustments: BalanceAdjustment[] = []
): Record<number, StoredEmployeeBalance> => {
  try {
    if (!employees || !Array.isArray(employees)) return {}
    if (!allShifts || !Array.isArray(allShifts)) return {}
    
    const monthId = format(targetMonth, 'yyyy-MM')
  const prevMonthDate = subMonths(targetMonth, 1)
  const prevMonthId = format(prevMonthDate, 'yyyy-MM')

  // Helper to calculate difference for a single month
  const calculateDifferenceForMonth = (mDate: Date): Record<number, number> => {
    const mId = format(mDate, 'yyyy-MM')
    const diffs: Record<number, number> = {}

    employees.forEach(emp => {
        // For calculation purposes, both paid and unpaid absences count towards the balance
        // to prevent employee debt for authorized leave.
        // In the future, for payroll export, we might filter out 'unpaid' absenceType.
        const { target, actual } = computeMonthTargetActual(mDate, emp, allShifts, weeklyHoursOverrides)

        // Adjustments for this month
        const adjustments = balanceAdjustments
          .filter(a => a.employeeId === emp.id && a.monthId === mId)
          .reduce((sum, a) => sum + a.amount, 0)

        diffs[emp.id] = actual - target + adjustments
    })

    return diffs
  }

  // 1. Calculate Previous Balance
  const prevBalances: Record<number, number> = {}
  
  // Initialize with initial balances for all employees
  // This ensures that if an employee is not found in the previous closure (e.g. new hire),
  // their initial balance is respected instead of defaulting to 0.
  employees.forEach(emp => {
      prevBalances[emp.id] = emp.initialBalance || 0
  })

  // Check if previous month is closed
  const prevClosure = monthlyClosures.find(c => c.monthId === prevMonthId && c.status === 'LOCKED')

  if (prevClosure) {
    try {
      const parsed = JSON.parse(prevClosure.balances) as StoredEmployeeBalance[]
      parsed.forEach(b => {
        // Overwrite with the actual settled balance from the closure
        prevBalances[b.employeeId] = b.accumulatedBalance
      })
    } catch (e) {
      console.error('Failed to parse previous month balances', e)
    }
  } else {
    // If previous month is OPEN, calculate from the last CLOSED month or Initial Balance
    
    // Find the latest closed month
    const sortedClosures = [...monthlyClosures]
      .filter(c => c.status === 'LOCKED' && c.monthId < monthId)
      .sort((a, b) => b.monthId.localeCompare(a.monthId))
    
    const latestClosure = sortedClosures[0]
    
    // Initial balances already set above

    // Load latest closure if exists
    if (latestClosure) {
        try {
            const parsed = JSON.parse(latestClosure.balances) as StoredEmployeeBalance[]
            parsed.forEach(b => {
                prevBalances[b.employeeId] = b.accumulatedBalance
            })
        } catch (e) {
            console.error('Failed to parse latest closure', e)
        }
    }

    // Calculate gap months (Open months before target)
    let gapStart = latestClosure 
        ? startOfMonth(addDays(parseISO(latestClosure.monthId + '-01'), 32)) 
        : undefined
    
    // Only look back at shift history if there are NO closures in the system at all.
    // If there is at least one closed month, that First Closed Month is the start of time.
    // We do not accumulate from shifts prior to the first closure.
    const hasAnyClosures = monthlyClosures.some(c => c.status === 'LOCKED')

    if (!gapStart && !hasAnyClosures && allShifts.length > 0) {
        const sortedShifts = [...allShifts].sort((a, b) => a.startTime.localeCompare(b.startTime))
        gapStart = startOfMonth(parseISO(sortedShifts[0].startTime))
    }
    
    if (gapStart && gapStart < targetMonth) {
        // Iterate months from gapStart to prevMonthDate
        let curr = gapStart
        while (curr <= prevMonthDate) {
            const diffs = calculateDifferenceForMonth(curr)
            employees.forEach(emp => {
                prevBalances[emp.id] = (prevBalances[emp.id] || 0) + (diffs[emp.id] || 0)
            })
            curr = addMonths(curr, 1)
        }
    }
  }

  // 3. Calculate Target Month Stats
  const results: Record<number, StoredEmployeeBalance> = {}
  
  const mStart = startOfMonth(targetMonth)
  const mEnd = endOfMonth(targetMonth)
  const daysInMonth = eachDayOfInterval({ start: mStart, end: mEnd })

  employees.forEach(emp => {
      // Target
      let target = 0
      daysInMonth.forEach(day => {
          target += getDailyLiability(day, emp, weeklyHoursOverrides)
      })

      // Actuals & Breakdown
      let workedHours = 0
      let paidAbsenceHours = 0
      let unpaidAbsenceHours = 0

      const empShifts = allShifts.filter(s => {
          if (s.employeeId !== emp.id) return false
          const sStart = parseISO(s.startTime)
          return sStart >= mStart && sStart <= mEnd
      })

      empShifts.forEach(s => {
          const start = parseISO(s.startTime)
          let end = parseISO(s.endTime)
          if (end < start) end = addDays(end, 1)
          
          const hours = differenceInMinutes(end, start) / 60
          
          if (s.type === 'absence') {
              if (s.isPaid === false) {
                  unpaidAbsenceHours += hours
              } else {
                  paidAbsenceHours += hours
              }
          } else {
              workedHours += hours
          }
      })

      const actuals = workedHours + paidAbsenceHours + unpaidAbsenceHours

      // Adjustments for target month
      const adjustments = balanceAdjustments
        .filter(a => a.employeeId === emp.id && a.monthId === monthId)
        .reduce((sum, a) => sum + a.amount, 0)

      const diff = actuals - target + adjustments
      const prev = prevBalances[emp.id] || 0

      results[emp.id] = {
          employeeId: emp.id,
          name: emp.name,
          targetHours: Number(target.toFixed(2)),
          actualHours: Number(actuals.toFixed(2)),
          monthlyDifference: Number(diff.toFixed(2)),
          accumulatedBalance: Number((prev + diff).toFixed(2)),
          workedHours: Number(workedHours.toFixed(2)),
          paidAbsenceHours: Number(paidAbsenceHours.toFixed(2)),
          unpaidAbsenceHours: Number(unpaidAbsenceHours.toFixed(2))
      }
  })

  return results
  } catch (error) {
    console.error("Critical error in calculateMonthStats:", error)
    return {}
  }
}
