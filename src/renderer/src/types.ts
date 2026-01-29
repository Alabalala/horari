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
