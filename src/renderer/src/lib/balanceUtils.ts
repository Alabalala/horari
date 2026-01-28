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
    const mStart = startOfMonth(mDate)
    const mEnd = endOfMonth(mDate)
    const mId = format(mDate, 'yyyy-MM')
    const daysInMonth = eachDayOfInterval({ start: mStart, end: mEnd })
    
    const diffs: Record<number, number> = {}
    
    employees.forEach(emp => {
        // Target
        let target = 0
        daysInMonth.forEach(day => {
            target += getDailyLiability(day, emp, weeklyHoursOverrides)
        })
        
        // Actuals
        const empShifts = allShifts.filter(s => {
            if (s.employeeId !== emp.id) return false
            const sStart = parseISO(s.startTime)
            return sStart >= mStart && sStart <= mEnd
        })
        
        const actuals = empShifts.reduce((sum, s) => {
            const start = parseISO(s.startTime)
          let end = parseISO(s.endTime)
          if (end < start) end = addDays(end, 1) // Handle cross-day
          
          // For calculation purposes, both paid and unpaid absences count towards the balance
          // to prevent employee debt for authorized leave.
          // In the future, for payroll export, we might filter out 'unpaid' absenceType.
          return sum + (differenceInMinutes(end, start) / 60)
        }, 0)
        
        // Adjustments for this month
        const adjustments = balanceAdjustments
          .filter(a => a.employeeId === emp.id && a.monthId === mId)
          .reduce((sum, a) => sum + a.amount, 0)

        diffs[emp.id] = actuals - target + adjustments
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
