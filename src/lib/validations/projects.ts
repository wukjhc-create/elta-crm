import { z } from 'zod'
import { PROJECT_STATUSES, PROJECT_PRIORITIES, TASK_STATUSES } from '@/types/projects.types'

// Create project schema
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Projektnavn er påkrævet')
    .max(200, 'Projektnavn må højst være 200 tegn'),
  description: z
    .string()
    .max(5000, 'Beskrivelse må højst være 5000 tegn')
    .nullable()
    .optional(),
  status: z.enum(PROJECT_STATUSES).default('planning'),
  priority: z.enum(PROJECT_PRIORITIES).default('medium'),
  customer_id: z.string().uuid('Vælg en kunde'),
  offer_id: z.string().uuid().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  estimated_hours: z
    .number()
    .min(0, 'Timer skal være mindst 0')
    .nullable()
    .optional(),
  budget: z
    .number()
    .min(0, 'Budget skal være mindst 0')
    .nullable()
    .optional(),
  project_manager_id: z.string().uuid().nullable().optional(),
  notes: z
    .string()
    .max(5000, 'Noter må højst være 5000 tegn')
    .nullable()
    .optional(),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>

// Update project schema
export const updateProjectSchema = createProjectSchema.partial().extend({
  id: z.string().uuid('Ugyldigt projekt ID'),
})

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

// Create task schema
export const createTaskSchema = z.object({
  project_id: z.string().uuid('Ugyldigt projekt ID'),
  title: z
    .string()
    .min(1, 'Titel er påkrævet')
    .max(200, 'Titel må højst være 200 tegn'),
  description: z
    .string()
    .max(2000, 'Beskrivelse må højst være 2000 tegn')
    .nullable()
    .optional(),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(PROJECT_PRIORITIES).default('medium'),
  assigned_to: z.string().uuid().nullable().optional(),
  estimated_hours: z
    .number()
    .min(0, 'Timer skal være mindst 0')
    .nullable()
    .optional(),
  due_date: z.string().nullable().optional(),
  position: z.number().int().optional(),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>

// Update task schema
export const updateTaskSchema = createTaskSchema
  .omit({ project_id: true })
  .partial()
  .extend({
    id: z.string().uuid('Ugyldigt opgave ID'),
  })

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

// Create time entry schema
export const createTimeEntrySchema = z.object({
  project_id: z.string().uuid('Ugyldigt projekt ID'),
  task_id: z.string().uuid().nullable().optional(),
  description: z
    .string()
    .max(500, 'Beskrivelse må højst være 500 tegn')
    .nullable()
    .optional(),
  hours: z
    .number()
    .min(0.25, 'Timer skal være mindst 0.25')
    .max(24, 'Timer må højst være 24'),
  date: z.string().min(1, 'Dato er påkrævet'),
  billable: z.boolean().default(true),
})

export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>

// Update time entry schema
export const updateTimeEntrySchema = createTimeEntrySchema
  .omit({ project_id: true })
  .partial()
  .extend({
    id: z.string().uuid('Ugyldigt tidsregistrering ID'),
  })

export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>

// Project filter schema
export const projectFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(PROJECT_PRIORITIES).optional(),
  customer_id: z.string().uuid().optional(),
  project_manager_id: z.string().uuid().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'name', 'start_date', 'end_date', 'priority']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type ProjectFilterInput = z.infer<typeof projectFilterSchema>
