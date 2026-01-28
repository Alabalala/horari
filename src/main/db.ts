import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

const dbPath = join(app.getPath('userData'), 'horari.db')
console.log('Database path:', dbPath)
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

export type Employee = {
  id?: number
  name: string
  role: string
  department: string
  status: 'Active' | 'Inactive' | 'On Leave'
  defaultHours: number
  displayOrder: number
  initialBalance: number
}

export type MonthlyClosure = {
  monthId: string // YYYY-MM
  status: 'LOCKED' | 'OPEN'
  closedAt: string // ISO string
  balances: string // JSON string of EmployeeBalance[]
}

export type EmployeeBalance = {
  employeeId: number
  name: string
  targetHours: number
  workedHours: number
  balance: number // worked - target
  totalBalance: number // previous + current balance
}

export type Shift = {
  id?: number
  employeeId: number
  startTime: string // ISO string
  endTime: string // ISO string
  type: 'work' | 'absence'
  absenceType?: 'holiday' | 'bank_holiday' | 'sick_leave' | 'unpaid' | 'other'
  isPaid: boolean
}

export type MonthlyHours = {
  id?: number
  employeeId: number
  month: string // YYYY-MM
  hours: number
}

export type BalanceAdjustment = {
  id?: number
  employeeId: number
  monthId: string // YYYY-MM
  amount: number
  description: string
  createdAt: string
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT NOT NULL,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId INTEGER NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    FOREIGN KEY(employeeId) REFERENCES employees(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS monthly_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId INTEGER NOT NULL,
    month TEXT NOT NULL,
    hours REAL NOT NULL,
    FOREIGN KEY(employeeId) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE(employeeId, month)
  );

  CREATE TABLE IF NOT EXISTS weekly_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId INTEGER NOT NULL,
    weekStart TEXT NOT NULL,
    hours REAL NOT NULL,
    FOREIGN KEY(employeeId) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE(employeeId, weekStart)
  );

  CREATE TABLE IF NOT EXISTS monthly_closures (
    monthId TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    closedAt TEXT NOT NULL,
    balances TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS balance_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId INTEGER NOT NULL,
    monthId TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY(employeeId) REFERENCES employees(id) ON DELETE CASCADE
  );
`)

try {
  db.exec('ALTER TABLE employees ADD COLUMN defaultHours REAL DEFAULT 40')
} catch (error) {
  // Column likely exists
}

try {
  db.exec('ALTER TABLE employees ADD COLUMN displayOrder INTEGER DEFAULT 0')
} catch (error) {
  // Column likely exists
}

try {
  db.exec('ALTER TABLE employees ADD COLUMN initialBalance REAL DEFAULT 0')
} catch (error) {
  // Column likely exists
}

// Migrations for Shift Absence
try {
  db.exec("ALTER TABLE shifts ADD COLUMN type TEXT DEFAULT 'work'")
} catch (error) {
  // Column likely exists
}

try {
  db.exec('ALTER TABLE shifts ADD COLUMN absenceType TEXT')
} catch (error) {
  // Column likely exists
}

try {
  db.exec('ALTER TABLE shifts ADD COLUMN isPaid INTEGER DEFAULT 1')
} catch (error) {
  // Column likely exists
}

// Initialize default settings if they don't exist
const defaultSettings = {
  language: 'en',
  theme: 'dark',
  companyName: 'My Company',
  openingTime: '08:00',
  closingTime: '20:00',
  autoUpdate: 'true',
  showSidebarCalendar: 'false'
}

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
Object.entries(defaultSettings).forEach(([key, value]) => {
  insertSetting.run(key, value)
})

export type Setting = {
  key: string
  value: string
}

export function getSettings(): Record<string, string> {
  const rows = db.prepare('SELECT * FROM settings').all() as Setting[]
  return rows.reduce(
    (acc, row) => {
      acc[row.key] = row.value
      return acc
    },
    {} as Record<string, string>
  )
}

export function updateSetting(key: string, value: string): Database.RunResult {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  return stmt.run(key, value)
}

export function getEmployees(): Employee[] {
  return db.prepare('SELECT * FROM employees ORDER BY displayOrder ASC, name ASC').all() as Employee[]
}

export function getEmployee(id: number): Employee | undefined {
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(id) as Employee | undefined
}

export function addEmployee(employee: Omit<Employee, 'id'>): Database.RunResult {
  const stmt = db.prepare(
    'INSERT INTO employees (name, role, department, status, defaultHours, displayOrder, initialBalance) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  return stmt.run(
    employee.name,
    employee.role,
    employee.department,
    employee.status,
    employee.defaultHours ?? 40,
    employee.displayOrder || 0,
    employee.initialBalance || 0
  )
}

export function updateEmployee(id: number, employee: Omit<Employee, 'id'>): Database.RunResult {
  const stmt = db.prepare(
    'UPDATE employees SET name = ?, role = ?, department = ?, status = ?, defaultHours = ?, displayOrder = ?, initialBalance = ? WHERE id = ?'
  )
  return stmt.run(
    employee.name,
    employee.role,
    employee.department,
    employee.status,
    employee.defaultHours,
    employee.displayOrder || 0,
    employee.initialBalance || 0,
    id
  )
}

export function updateEmployeeOrder(id: number, order: number): Database.RunResult {
  const stmt = db.prepare('UPDATE employees SET displayOrder = ? WHERE id = ?')
  return stmt.run(order, id)
}

export function deleteEmployee(id: number): Database.RunResult {
  const stmt = db.prepare('DELETE FROM employees WHERE id = ?')
  return stmt.run(id)
}

// Monthly Hours operations
export function getMonthlyHours(employeeId: number, month: string): number | undefined {
  const result = db
    .prepare('SELECT hours FROM monthly_hours WHERE employeeId = ? AND month = ?')
    .get(employeeId, month) as { hours: number } | undefined
  return result?.hours
}

export function setMonthlyHours(
  employeeId: number,
  month: string,
  hours: number
): Database.RunResult {
  const stmt = db.prepare(
    'INSERT INTO monthly_hours (employeeId, month, hours) VALUES (?, ?, ?) ON CONFLICT(employeeId, month) DO UPDATE SET hours = ?'
  )
  return stmt.run(employeeId, month, hours, hours)
}

// Weekly Hours operations
export function getWeeklyHours(employeeId: number, weekStart: string): number | undefined {
  const result = db
    .prepare('SELECT hours FROM weekly_hours WHERE employeeId = ? AND weekStart = ?')
    .get(employeeId, weekStart) as { hours: number } | undefined
  return result?.hours
}

export function getAllWeeklyHours(weekStart: string): { employeeId: number; hours: number }[] {
  return db.prepare('SELECT employeeId, hours FROM weekly_hours WHERE weekStart = ?').all(weekStart) as { employeeId: number; hours: number }[]
}

export function setWeeklyHours(
  employeeId: number,
  weekStart: string,
  hours: number
): Database.RunResult {
  const stmt = db.prepare(
    'INSERT INTO weekly_hours (employeeId, weekStart, hours) VALUES (?, ?, ?) ON CONFLICT(employeeId, weekStart) DO UPDATE SET hours = ?'
  )
  return stmt.run(employeeId, weekStart, hours, hours)
}

export function getShifts(employeeId: number, startDate?: string, endDate?: string): Shift[] {
  let query = 'SELECT * FROM shifts WHERE employeeId = ?'
  const params: (number | string)[] = [employeeId]

  if (startDate && endDate) {
    query += ' AND startTime >= ? AND endTime <= ?'
    params.push(startDate, endDate)
  }

  query += ' ORDER BY startTime ASC'
  return db.prepare(query).all(...params) as Shift[]
}

export function getAllShifts(
  startDate?: string,
  endDate?: string
): (Shift & { employeeName: string })[] {
  let query = `
    SELECT shifts.*, employees.name as employeeName 
    FROM shifts 
    JOIN employees ON shifts.employeeId = employees.id
    WHERE 1=1
  `
  const params: string[] = []

  if (startDate && endDate) {
    query += ' AND startTime >= ? AND startTime <= ?'
    params.push(startDate, endDate)
  }

  query += ' ORDER BY startTime ASC'
  return db.prepare(query).all(...params) as (Shift & { employeeName: string })[]
}

export function addShift(shift: Omit<Shift, 'id'>): Database.RunResult {
  const stmt = db.prepare('INSERT INTO shifts (employeeId, startTime, endTime, type, absenceType, isPaid) VALUES (?, ?, ?, ?, ?, ?)')
  return stmt.run(shift.employeeId, shift.startTime, shift.endTime, shift.type || 'work', shift.absenceType || null, shift.isPaid ? 1 : 0)
}

export function updateShift(id: number, shift: Omit<Shift, 'id'>): Database.RunResult {
  const stmt = db.prepare(
    'UPDATE shifts SET employeeId = ?, startTime = ?, endTime = ?, type = ?, absenceType = ?, isPaid = ? WHERE id = ?'
  )
  return stmt.run(shift.employeeId, shift.startTime, shift.endTime, shift.type || 'work', shift.absenceType || null, shift.isPaid ? 1 : 0, id)
}

export function deleteShift(id: number): Database.RunResult {
  const stmt = db.prepare('DELETE FROM shifts WHERE id = ?')
  return stmt.run(id)
}

// Monthly Closures operations
export function getMonthlyClosure(monthId: string): MonthlyClosure | undefined {
  return db.prepare('SELECT * FROM monthly_closures WHERE monthId = ?').get(monthId) as MonthlyClosure | undefined
}

export function getAllMonthlyClosures(): MonthlyClosure[] {
  return db.prepare('SELECT * FROM monthly_closures ORDER BY monthId DESC').all() as MonthlyClosure[]
}

export function setMonthlyClosure(closure: MonthlyClosure): Database.RunResult {
  const stmt = db.prepare(
    'INSERT INTO monthly_closures (monthId, status, closedAt, balances) VALUES (?, ?, ?, ?) ON CONFLICT(monthId) DO UPDATE SET status = ?, closedAt = ?, balances = ?'
  )
  return stmt.run(closure.monthId, closure.status, closure.closedAt, closure.balances, closure.status, closure.closedAt, closure.balances)
}

export function deleteMonthlyClosure(monthId: string): Database.RunResult {
  const stmt = db.prepare('DELETE FROM monthly_closures WHERE monthId = ?')
  return stmt.run(monthId)
}

// Balance Adjustments operations
export function getBalanceAdjustments(employeeId?: number): BalanceAdjustment[] {
  let query = 'SELECT * FROM balance_adjustments'
  const params: number[] = []
  
  if (employeeId) {
    query += ' WHERE employeeId = ?'
    params.push(employeeId)
  }
  
  query += ' ORDER BY createdAt DESC'
  return db.prepare(query).all(...params) as BalanceAdjustment[]
}

export function addBalanceAdjustment(adjustment: Omit<BalanceAdjustment, 'id'>): Database.RunResult {
  const stmt = db.prepare('INSERT INTO balance_adjustments (employeeId, monthId, amount, description, createdAt) VALUES (?, ?, ?, ?, ?)')
  return stmt.run(adjustment.employeeId, adjustment.monthId, adjustment.amount, adjustment.description, adjustment.createdAt)
}

export function deleteBalanceAdjustment(id: number): Database.RunResult {
  const stmt = db.prepare('DELETE FROM balance_adjustments WHERE id = ?')
  return stmt.run(id)
}
