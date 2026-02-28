/**
 * Customer Tasks — Types
 */

export type TaskStatus = 'pending' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface CustomerTask {
  id: string
  customer_id: string
  offer_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigned_to: string | null
  due_date: string | null
  reminder_at: string | null
  snoozed_until: string | null
  completed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface CustomerTaskWithRelations extends CustomerTask {
  assigned_profile?: {
    id: string
    full_name: string | null
    email: string
  } | null
  customer?: {
    id: string
    company_name: string
    customer_number: string
  } | null
  offer?: {
    id: string
    title: string
    offer_number: string
  } | null
}

export interface CreateCustomerTaskInput {
  customer_id: string
  offer_id?: string
  title: string
  description?: string
  priority?: TaskPriority
  assigned_to?: string
  due_date?: string
  reminder_at?: string
}

export interface UpdateCustomerTaskInput {
  id: string
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  assigned_to?: string | null
  due_date?: string | null
  reminder_at?: string | null
  snoozed_until?: string | null
}

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Afventer', color: 'text-amber-800', bgColor: 'bg-amber-100' },
  in_progress: { label: 'I gang', color: 'text-blue-800', bgColor: 'bg-blue-100' },
  done: { label: 'Udført', color: 'text-green-800', bgColor: 'bg-green-100' },
}

export const TASK_PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Lav', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  normal: { label: 'Normal', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  high: { label: 'Høj', color: 'text-orange-800', bgColor: 'bg-orange-100' },
  urgent: { label: 'Akut', color: 'text-red-800', bgColor: 'bg-red-100' },
}
