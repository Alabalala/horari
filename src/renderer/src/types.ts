export type Employee = {
  id: number
  name: string
  role: string
  department: string
  status: string
  defaultHours: number
  displayOrder: number
  initialBalance?: number
}

export type Shift = {
  id: number
  employeeId: number
  startTime: string
  endTime: string
  type: 'work' | 'absence'
  absenceType?: 'holiday' | 'bank_holiday' | 'sick_leave' | 'unpaid' | 'other'
  isPaid: boolean
  employeeName?: string
  scenarioId?: string
}

export type Scenario = {
  id: string
  name: string
  createdAt: string
  description?: string
  startDate: string
  endDate: string
}

export type MonthlyHours = {
  id: number
  employeeId: number
  month: string
  hours: number
}

export type BalanceAdjustment = {
  id: number
  employeeId: number
  monthId: string
  amount: number
  description: string
  createdAt: string
  balanceAfter?: number
}
