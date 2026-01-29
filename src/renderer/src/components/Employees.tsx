import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Trash2, Edit2, X, Save, Calendar, Filter, GripVertical } from 'lucide-react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '../hooks/useSettings'
import ConfirmModal from './ConfirmModal'
import { Employee } from '@renderer/types'

export default function Employees(): React.JSX.Element {
  const { t } = useSettings()
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'danger' | 'warning' | 'info'
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {}
  })

  // Filter States
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    department: '',
    status: 'Active',
    defaultHours: 40,
    initialBalance: 0
  })
  const [isNewDepartment, setIsNewDepartment] = useState(false)

  const fetchEmployees = async (): Promise<void> => {
    try {
      const data = await window.api.employees.getAll()
      // Sort by displayOrder
      const sorted = (data as Employee[]).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      setEmployees(sorted)
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    }
  }

  useEffect(() => {
    fetchEmployees()
  }, [])

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    try {
      if (editingId) {
        await window.api.employees.update(editingId, formData)
      } else {
        await window.api.employees.add(formData)
      }
      setIsModalOpen(false)
      setEditingId(null)
      setFormData({ name: '', role: '', department: '', status: 'Active', defaultHours: 40, initialBalance: 0 })
      fetchEmployees()
    } catch (error) {
      console.error('Failed to save employee:', error)
      setConfirmState({
          isOpen: true,
          title: t('error') || 'Error',
          message: `Failed to save employee: ${error instanceof Error ? error.message : String(error)}`,
          type: 'danger',
          onConfirm: () => setConfirmState(prev => ({ ...prev, isOpen: false }))
      })
    }
  }

  const handleEdit = (employee: Employee): void => {
    setEditingId(employee.id)
    setFormData({
      name: employee.name,
      role: employee.role,
      department: employee.department,
      status: employee.status,
      defaultHours: employee.defaultHours ?? 40,
      initialBalance: employee.initialBalance ?? 0
    })
    setIsNewDepartment(false)
    setIsModalOpen(true)
  }

  const handleDelete = (id: number): void => {
    setConfirmState({
      isOpen: true,
      title: t('deleteEmployee') || 'Delete Employee',
      message: t('confirmDelete') || 'Are you sure you want to delete this employee?',
      type: 'danger',
      onConfirm: async () => {
          setConfirmState(prev => ({ ...prev, isOpen: false })) // Close confirmation
          try {
            await window.api.employees.delete(id)
            fetchEmployees()
          } catch (error) {
            console.error('Failed to delete employee:', error)
            // Show error
            setTimeout(() => {
                setConfirmState({
                    isOpen: true,
                    title: t('error') || 'Error',
                    message: `${t('failedToDeleteEmployee')}: ${error instanceof Error ? error.message : String(error)}`,
                    type: 'danger',
                    onConfirm: () => setConfirmState(prev => ({ ...prev, isOpen: false }))
                })
            }, 100)
          }
      }
    })
  }

  const openAddModal = (): void => {
    setEditingId(null)
    setFormData({ name: '', role: '', department: '', status: 'Active', defaultHours: 40, initialBalance: 0 })
    setIsNewDepartment(false)
    setIsModalOpen(true)
  }

  // Filter Logic
  const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean))).sort()
  const roles = Array.from(new Set(employees.map(e => e.role).filter(Boolean))).sort()
  const statuses = Array.from(new Set(employees.map(e => e.status).filter(Boolean))).sort()

  const filteredEmployees = employees.filter(emp => {
    if (departmentFilter !== 'all' && emp.department !== departmentFilter) return false
    if (roleFilter !== 'all' && emp.role !== roleFilter) return false
    if (statusFilter !== 'all' && emp.status !== statusFilter) return false
    return true
  })

  const handleDragEnd = async (result: DropResult): Promise<void> => {
    const { source, destination } = result
    if (!destination) return
    if (source.index === destination.index) return

    // We are reordering the filtered list
    const currentList = [...filteredEmployees]
    const [movedEmp] = currentList.splice(source.index, 1)
    currentList.splice(destination.index, 0, movedEmp)
    
    // Permutation Strategy: Collect existing orders from the visible list and redistribute
    // This ensures we reuse valid order numbers and don't reset to 0..N if we are in a filtered view
    let ordersToDistribute = filteredEmployees.map(e => e.displayOrder || 0).sort((a, b) => a - b)
    
    // Ensure distinct values if we have collisions or all zeros (initial state)
    if (new Set(ordersToDistribute).size !== ordersToDistribute.length || ordersToDistribute.every(o => o === 0)) {
        const base = Date.now()
        ordersToDistribute = filteredEmployees.map((_, i) => base + i)
    }

    const updates: Promise<void>[] = []
    currentList.forEach((emp, index) => {
        const newOrder = ordersToDistribute[index] !== undefined ? ordersToDistribute[index] : index
        if (emp.displayOrder !== newOrder) {
            emp.displayOrder = newOrder
            updates.push(window.api.employees.updateOrder(emp.id, newOrder))
        }
    })
    
    // Update local state
    setEmployees(prev => {
        const newMap = new Map(currentList.map(e => [e.id, e]))
        // We need to merge the reordered filtered items back into the main list
        // preserving the new order for the filtered items, and keeping others in place?
        // Actually, easiest is to just map the updates.
        // But we want to reflect the new sort order immediately.
        
        // Strategy: 
        // 1. Create a map of updated employees.
        // 2. Map over the previous full list.
        // 3. BUT the full list needs to be re-sorted based on the new displayOrders.
        
        const updatedFullList = prev.map(e => newMap.get(e.id) || e)
        return updatedFullList.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    })
    
    try {
        await Promise.all(updates)
    } catch (err) {
        console.error("Failed to update order", err)
        fetchEmployees()
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">{t('employees')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('manageTeamMembers')}</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> {t('addEmployee')}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900/50 p-4 rounded-md border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <Filter className="h-4 w-4" />
          <span className="text-sm font-medium">{t('filterBy') || 'Filter by'}:</span>
        </div>

        <select
          className="bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-200 text-sm rounded-md pl-3 pr-8 py-1.5 focus:outline-none focus:border-blue-500"
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
        >
          <option value="all" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">{t('allDepartments') || 'All Departments'}</option>
          {departments.map((d) => (
            <option key={d} value={d} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">
              {d}
            </option>
          ))}
        </select>

        <select
          className="bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-200 text-sm rounded-md pl-3 pr-8 py-1.5 focus:outline-none focus:border-blue-500"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">{t('allRoles') || 'All Roles'}</option>
          {roles.map((r) => (
            <option key={r} value={r} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">
              {r}
            </option>
          ))}
        </select>

        <select
          className="bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-200 text-sm rounded-md pl-3 pr-8 py-1.5 focus:outline-none focus:border-blue-500"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">{t('allStatuses') || 'All Statuses'}</option>
          {statuses.map((s) => (
            <option key={s} value={s} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">
              {s === 'Active' ? t('statusActive') : s === 'Inactive' ? t('statusInactive') : s === 'On Leave' ? t('statusOnLeave') : s}
            </option>
          ))}
        </select>

        {(departmentFilter !== 'all' || roleFilter !== 'all' || statusFilter !== 'all') && (
          <button
            onClick={() => {
              setDepartmentFilter('all')
              setRoleFilter('all')
              setStatusFilter('all')
            }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 ml-auto"
          >
            {t('clearFilters') || 'Clear filters'}
          </button>
        )}
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>ID</TableHead>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('role')}</TableHead>
              <TableHead>{t('department')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <Droppable droppableId="employees-list">
            {(provided) => (
              <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                {filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500 dark:text-slate-400 py-8">
                      {t('noActiveEmployees')}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((emp, index) => (
                    <Draggable key={emp.id} draggableId={emp.id.toString()} index={index}>
                      {(provided, snapshot) => (
                        <TableRow
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50",
                            snapshot.isDragging && "bg-slate-100 dark:bg-slate-800 shadow-lg relative z-20"
                          )}
                          onDoubleClick={() => navigate(`/employees/${emp.id}`)}
                        >
                          <TableCell className="w-[40px] px-0 text-center">
                            <div 
                              {...provided.dragHandleProps}
                              className="flex items-center justify-center p-2 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            >
                              <GripVertical className="h-4 w-4" />
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-500 dark:text-slate-400">#{emp.id}</TableCell>
                          <TableCell className="font-medium text-slate-900 dark:text-slate-200">{emp.name}</TableCell>
                          <TableCell className="text-slate-700 dark:text-slate-300">{emp.role}</TableCell>
                          <TableCell className="text-slate-500 dark:text-slate-400">{emp.department}</TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                emp.status === 'Active'
                                  ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                  : emp.status === 'Inactive'
                                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                                    : 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              )}
                            >
                              {emp.status === 'Active'
                                ? t('statusActive')
                                : emp.status === 'Inactive'
                                  ? t('statusInactive')
                                  : emp.status === 'On Leave'
                                    ? t('statusOnLeave')
                                    : emp.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Link
                                to={`/employees/${emp.id}`}
                                className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title={t('shifts')}
                              >
                                <Calendar className="h-4 w-4" />
                              </Link>
                              <button
                                onClick={() => handleEdit(emp)}
                                className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title={t('editEmployee')}
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(emp.id)}
                                className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                title={t('delete')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Draggable>
                  ))
                )}
                {provided.placeholder}
              </TableBody>
            )}
          </Droppable>
        </Table>
      </DragDropContext>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingId ? t('editEmployee') : t('addEmployee')}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('name')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('placeholderName')}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('role')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('placeholderRole')}
                  className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('department')}</label>
                {isNewDepartment ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder={t('placeholderDepartment')}
                      className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewDepartment(false)
                        setFormData({ ...formData, department: '' })
                      }}
                      className="shrink-0 rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                      title={t('cancel')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <select
                    required
                    className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.department}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsNewDepartment(true)
                        setFormData({ ...formData, department: '' })
                      } else {
                        setFormData({ ...formData, department: e.target.value })
                      }
                    }}
                  >
                    <option value="" disabled className="bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                      {t('selectDepartment') || 'Select Department'}
                    </option>
                    {departments.map((d) => (
                      <option key={d} value={d} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">
                        {d}
                      </option>
                    ))}
                    <option value="__new__" className="bg-white dark:bg-slate-950 font-semibold text-blue-600 dark:text-blue-400">
                      + {t('createNewDepartment') || 'Create New Department'}
                    </option>
                  </select>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('defaultWeeklyHours') || 'Default Weekly Hours'}
                </label>
                <input
                  type="number"
                  required
                  className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={formData.defaultHours}
                  onChange={(e) =>
                    setFormData({ ...formData, defaultHours: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('initialBalance') || 'Initial Balance (Starting Debt)'}
                </label>
                <input
                  type="number"
                  className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={formData.initialBalance}
                  onChange={(e) =>
                    setFormData({ ...formData, initialBalance: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('status')}</label>
                <select
                  className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 pl-3 pr-8 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="Active" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">{t('statusActive')}</option>
                  <option value="Inactive" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">{t('statusInactive')}</option>
                  <option value="On Leave" className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200">{t('statusOnLeave')}</option>
                </select>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-md border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <Save className="h-4 w-4" /> {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        type={confirmState.type}
        confirmText={t('confirm')}
        cancelText={t('cancel')}
      />
    </div>
  )
}
