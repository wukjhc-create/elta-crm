// Project status enum
export const PROJECT_STATUSES = [
  'planning',
  'active',
  'on_hold',
  'completed',
  'cancelled',
] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

// Project priority enum
export const PROJECT_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number]

// Task status enum (Kanban columns)
export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

// Status labels in Danish
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planlægning',
  active: 'Aktiv',
  on_hold: 'På hold',
  completed: 'Afsluttet',
  cancelled: 'Annulleret',
}

// Priority labels in Danish
export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low: 'Lav',
  medium: 'Medium',
  high: 'Høj',
  urgent: 'Akut',
}

// Task status labels in Danish
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Opgaver',
  in_progress: 'I gang',
  review: 'Til gennemgang',
  done: 'Færdig',
}

// Valid status transitions: from → allowed destinations
export const PROJECT_STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  planning: ['active', 'cancelled'],
  active: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['active', 'cancelled'],
  completed: ['active'],
  cancelled: ['planning'],
}

export function isValidProjectTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

// Status colors
export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: 'bg-gray-100 text-gray-800',
  active: 'bg-green-100 text-green-800',
  on_hold: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-blue-100 text-blue-800',
  cancelled: 'bg-red-100 text-red-800',
}

// Priority colors
export const PROJECT_PRIORITY_COLORS: Record<ProjectPriority, string> = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
}

// Task status colors
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-gray-100',
  in_progress: 'bg-blue-100',
  review: 'bg-yellow-100',
  done: 'bg-green-100',
}

// Project database type
export interface Project {
  id: string
  project_number: string
  name: string
  description: string | null
  status: ProjectStatus
  priority: ProjectPriority
  customer_id: string
  offer_id: string | null
  start_date: string | null
  end_date: string | null
  estimated_hours: number | null
  actual_hours: number
  budget: number | null
  actual_cost: number
  project_manager_id: string | null
  assigned_technicians: string[]
  notes: string | null
  tags: string[]
  custom_fields: Record<string, unknown>
  created_by: string
  created_at: string
  updated_at: string
}

// Project with relations
export interface ProjectWithRelations extends Project {
  customer?: {
    id: string
    customer_number: string
    company_name: string
    contact_person: string
    email: string
  } | null
  offer?: {
    id: string
    offer_number: string
    title: string
  } | null
  project_manager?: {
    id: string
    full_name: string | null
    email: string
  } | null
  created_by_profile?: {
    id: string
    full_name: string | null
    email: string
  } | null
  tasks?: ProjectTask[]
  time_entries?: TimeEntry[]
}

// Task database type
export interface ProjectTask {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: ProjectPriority
  assigned_to: string | null
  estimated_hours: number | null
  actual_hours: number
  due_date: string | null
  completed_at: string | null
  position: number | null
  created_by: string
  created_at: string
  updated_at: string
}

// Task with relations
export interface ProjectTaskWithRelations extends ProjectTask {
  assigned_to_profile?: {
    id: string
    full_name: string | null
    email: string
  } | null
}

// Time entry database type
export interface TimeEntry {
  id: string
  project_id: string
  task_id: string | null
  user_id: string
  description: string | null
  hours: number
  date: string
  billable: boolean
  created_at: string
  updated_at: string
}

// Time entry with relations
export interface TimeEntryWithRelations extends TimeEntry {
  user?: {
    id: string
    full_name: string | null
    email: string
  } | null
  task?: {
    id: string
    title: string
  } | null
}

// Create project input
export interface CreateProjectInput {
  name: string
  description?: string | null
  status?: ProjectStatus
  priority?: ProjectPriority
  customer_id: string
  offer_id?: string | null
  start_date?: string | null
  end_date?: string | null
  estimated_hours?: number | null
  budget?: number | null
  project_manager_id?: string | null
  notes?: string | null
}

// Create task input
export interface CreateTaskInput {
  project_id: string
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: ProjectPriority
  assigned_to?: string | null
  estimated_hours?: number | null
  due_date?: string | null
  position?: number
}

// Create time entry input
export interface CreateTimeEntryInput {
  project_id: string
  task_id?: string | null
  description?: string | null
  hours: number
  date: string
  billable?: boolean
}
