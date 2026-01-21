export type Employee = {
  id: number
  name: string
  role: string
  department: string
  status: string
  defaultHours: number
  displayOrder: number
}

export type Shift = {
  id: number
  employeeId: number
  startTime: string
  endTime: string
  employeeName?: string
}

export type MonthlyHours = {
  id: number
  employeeId: number
  month: string
  hours: number
}
