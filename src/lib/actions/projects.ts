'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import {
  createProjectSchema,
  updateProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  createTimeEntrySchema,
  updateTimeEntrySchema,
} from '@/lib/validations/projects'
import type {
  Project,
  ProjectWithRelations,
  ProjectTask,
  ProjectTaskWithRelations,
  TimeEntry,
  TimeEntryWithRelations,
  ProjectStatus,
  ProjectPriority,
  TaskStatus,
} from '@/types/projects.types'
import type { PaginatedResponse, ActionResult } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'

// ==================== Projects ====================

// Get all projects with pagination
export async function getProjects(filters?: {
  search?: string
  status?: ProjectStatus
  priority?: ProjectPriority
  customer_id?: string
  project_manager_id?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}): Promise<ActionResult<PaginatedResponse<ProjectWithRelations>>> {
  try {
    const supabase = await createClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Build count query
    let countQuery = supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase
      .from('projects')
      .select(`
        *,
        customer:customers(id, customer_number, company_name, contact_person, email)
      `)

    // Apply filters to both queries
    if (filters?.search) {
      const searchFilter = `name.ilike.%${filters.search}%,project_number.ilike.%${filters.search}%`
      countQuery = countQuery.or(searchFilter)
      dataQuery = dataQuery.or(searchFilter)
    }

    if (filters?.status) {
      countQuery = countQuery.eq('status', filters.status)
      dataQuery = dataQuery.eq('status', filters.status)
    }

    if (filters?.priority) {
      countQuery = countQuery.eq('priority', filters.priority)
      dataQuery = dataQuery.eq('priority', filters.priority)
    }

    if (filters?.customer_id) {
      countQuery = countQuery.eq('customer_id', filters.customer_id)
      dataQuery = dataQuery.eq('customer_id', filters.customer_id)
    }

    if (filters?.project_manager_id) {
      countQuery = countQuery.eq('project_manager_id', filters.project_manager_id)
      dataQuery = dataQuery.eq('project_manager_id', filters.project_manager_id)
    }

    // Apply sorting
    const sortBy = filters?.sortBy || 'created_at'
    const sortOrder = filters?.sortOrder || 'desc'
    dataQuery = dataQuery.order(sortBy, { ascending: sortOrder === 'asc' })

    // Apply pagination
    dataQuery = dataQuery.range(offset, offset + pageSize - 1)

    // Execute both queries
    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    if (countResult.error) {
      console.error('Error counting projects:', countResult.error)
      return { success: false, error: 'Kunne ikke hente projekter' }
    }

    if (dataResult.error) {
      console.error('Error fetching projects:', dataResult.error)
      return { success: false, error: 'Kunne ikke hente projekter' }
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: dataResult.data as ProjectWithRelations[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (error) {
    console.error('Error in getProjects:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get single project with all relations
export async function getProject(id: string): Promise<ActionResult<ProjectWithRelations>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        customer:customers(id, customer_number, company_name, contact_person, email),
        offer:offers(id, offer_number, title),
        tasks:project_tasks(*),
        time_entries(*, task:project_tasks(id, title))
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching project:', error)
      return { success: false, error: 'Kunne ikke hente projekt' }
    }

    // Sort tasks by status and position
    if (data.tasks) {
      data.tasks.sort((a: ProjectTask, b: ProjectTask) => {
        const statusOrder = { todo: 0, in_progress: 1, review: 2, done: 3 }
        if (statusOrder[a.status as TaskStatus] !== statusOrder[b.status as TaskStatus]) {
          return statusOrder[a.status as TaskStatus] - statusOrder[b.status as TaskStatus]
        }
        return (a.position || 0) - (b.position || 0)
      })
    }

    // Sort time entries by date
    if (data.time_entries) {
      data.time_entries.sort((a: TimeEntry, b: TimeEntry) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    }

    return { success: true, data: data as ProjectWithRelations }
  } catch (error) {
    console.error('Error in getProject:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Generate next project number
async function generateProjectNumber(): Promise<string> {
  const supabase = await createClient()
  const currentYear = new Date().getFullYear().toString().slice(-2)
  const prefix = `P${currentYear}`

  const { data } = await supabase
    .from('projects')
    .select('project_number')
    .like('project_number', `${prefix}%`)
    .order('project_number', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) {
    return `${prefix}0001`
  }

  const lastNumber = data[0].project_number
  const numPart = parseInt(lastNumber.slice(3), 10)
  const nextNum = numPart + 1
  return `${prefix}${nextNum.toString().padStart(4, '0')}`
}

// Create project
export async function createProject(formData: FormData): Promise<ActionResult<Project>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      status: (formData.get('status') as string) || 'planning',
      priority: (formData.get('priority') as string) || 'medium',
      customer_id: formData.get('customer_id') as string,
      offer_id: formData.get('offer_id') as string || null,
      start_date: formData.get('start_date') as string || null,
      end_date: formData.get('end_date') as string || null,
      estimated_hours: formData.get('estimated_hours')
        ? Number(formData.get('estimated_hours'))
        : null,
      budget: formData.get('budget') ? Number(formData.get('budget')) : null,
      project_manager_id: formData.get('project_manager_id') as string || null,
      notes: formData.get('notes') as string || null,
    }

    const validated = createProjectSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const projectNumber = await generateProjectNumber()

    const { data, error } = await supabase
      .from('projects')
      .insert({
        ...validated.data,
        project_number: projectNumber,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating project:', error)
      return { success: false, error: 'Kunne ikke oprette projekt' }
    }

    revalidatePath('/projects')
    return { success: true, data: data as Project }
  } catch (error) {
    console.error('Error in createProject:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update project
export async function updateProject(formData: FormData): Promise<ActionResult<Project>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Projekt ID mangler' }
    }

    const rawData = {
      id,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      status: formData.get('status') as string,
      priority: formData.get('priority') as string,
      customer_id: formData.get('customer_id') as string,
      offer_id: formData.get('offer_id') as string || null,
      start_date: formData.get('start_date') as string || null,
      end_date: formData.get('end_date') as string || null,
      estimated_hours: formData.get('estimated_hours')
        ? Number(formData.get('estimated_hours'))
        : null,
      budget: formData.get('budget') ? Number(formData.get('budget')) : null,
      project_manager_id: formData.get('project_manager_id') as string || null,
      notes: formData.get('notes') as string || null,
    }

    const validated = updateProjectSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: projectId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single()

    if (error) {
      console.error('Error updating project:', error)
      return { success: false, error: 'Kunne ikke opdatere projekt' }
    }

    revalidatePath('/projects')
    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: data as Project }
  } catch (error) {
    console.error('Error in updateProject:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Delete project
export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('projects').delete().eq('id', id)

    if (error) {
      console.error('Error deleting project:', error)
      return { success: false, error: 'Kunne ikke slette projekt' }
    }

    revalidatePath('/projects')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteProject:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update project status
export async function updateProjectStatus(
  id: string,
  status: ProjectStatus
): Promise<ActionResult<Project>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('projects')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating project status:', error)
      return { success: false, error: 'Kunne ikke opdatere status' }
    }

    revalidatePath('/projects')
    revalidatePath(`/projects/${id}`)
    return { success: true, data: data as Project }
  } catch (error) {
    console.error('Error in updateProjectStatus:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ==================== Tasks ====================

// Create task
export async function createTask(formData: FormData): Promise<ActionResult<ProjectTask>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      project_id: formData.get('project_id') as string,
      title: formData.get('title') as string,
      description: formData.get('description') as string || null,
      status: (formData.get('status') as string) || 'todo',
      priority: (formData.get('priority') as string) || 'medium',
      assigned_to: formData.get('assigned_to') as string || null,
      estimated_hours: formData.get('estimated_hours')
        ? Number(formData.get('estimated_hours'))
        : null,
      due_date: formData.get('due_date') as string || null,
      position: formData.get('position') ? Number(formData.get('position')) : 1,
    }

    const validated = createTaskSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('project_tasks')
      .insert({
        ...validated.data,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating task:', error)
      return { success: false, error: 'Kunne ikke oprette opgave' }
    }

    revalidatePath(`/projects/${validated.data.project_id}`)
    return { success: true, data: data as ProjectTask }
  } catch (error) {
    console.error('Error in createTask:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update task
export async function updateTask(formData: FormData): Promise<ActionResult<ProjectTask>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    const projectId = formData.get('project_id') as string

    if (!id) {
      return { success: false, error: 'Opgave ID mangler' }
    }

    const rawData = {
      id,
      title: formData.get('title') as string,
      description: formData.get('description') as string || null,
      status: formData.get('status') as string,
      priority: formData.get('priority') as string,
      assigned_to: formData.get('assigned_to') as string || null,
      estimated_hours: formData.get('estimated_hours')
        ? Number(formData.get('estimated_hours'))
        : null,
      due_date: formData.get('due_date') as string || null,
    }

    const validated = updateTaskSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: taskId, ...updateData } = validated.data

    // Set completed_at if status is done
    const finalUpdateData: Record<string, unknown> = { ...updateData }
    if (updateData.status === 'done') {
      finalUpdateData.completed_at = new Date().toISOString()
    } else {
      finalUpdateData.completed_at = null
    }

    const { data, error } = await supabase
      .from('project_tasks')
      .update(finalUpdateData)
      .eq('id', taskId)
      .select()
      .single()

    if (error) {
      console.error('Error updating task:', error)
      return { success: false, error: 'Kunne ikke opdatere opgave' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: data as ProjectTask }
  } catch (error) {
    console.error('Error in updateTask:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update task status (for drag and drop)
export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  projectId: string
): Promise<ActionResult<ProjectTask>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const updateData: Record<string, unknown> = { status }
    if (status === 'done') {
      updateData.completed_at = new Date().toISOString()
    } else {
      updateData.completed_at = null
    }

    const { data, error } = await supabase
      .from('project_tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating task status:', error)
      return { success: false, error: 'Kunne ikke opdatere status' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: data as ProjectTask }
  } catch (error) {
    console.error('Error in updateTaskStatus:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Delete task
export async function deleteTask(id: string, projectId: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('project_tasks').delete().eq('id', id)

    if (error) {
      console.error('Error deleting task:', error)
      return { success: false, error: 'Kunne ikke slette opgave' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error('Error in deleteTask:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ==================== Time Entries ====================

// Create time entry
export async function createTimeEntry(
  formData: FormData
): Promise<ActionResult<TimeEntry>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      project_id: formData.get('project_id') as string,
      task_id: formData.get('task_id') as string || null,
      description: formData.get('description') as string || null,
      hours: Number(formData.get('hours')),
      date: formData.get('date') as string,
      billable: formData.get('billable') !== 'false',
    }

    const validated = createTimeEntrySchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        ...validated.data,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating time entry:', error)
      return { success: false, error: 'Kunne ikke oprette tidsregistrering' }
    }

    revalidatePath(`/projects/${validated.data.project_id}`)
    return { success: true, data: data as TimeEntry }
  } catch (error) {
    console.error('Error in createTimeEntry:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update time entry
export async function updateTimeEntry(
  formData: FormData
): Promise<ActionResult<TimeEntry>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    const projectId = formData.get('project_id') as string

    if (!id) {
      return { success: false, error: 'Tidsregistrering ID mangler' }
    }

    const rawData = {
      id,
      task_id: formData.get('task_id') as string || null,
      description: formData.get('description') as string || null,
      hours: Number(formData.get('hours')),
      date: formData.get('date') as string,
      billable: formData.get('billable') !== 'false',
    }

    const validated = updateTimeEntrySchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()
    const { id: entryId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('time_entries')
      .update(updateData)
      .eq('id', entryId)
      .select()
      .single()

    if (error) {
      console.error('Error updating time entry:', error)
      return { success: false, error: 'Kunne ikke opdatere tidsregistrering' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true, data: data as TimeEntry }
  } catch (error) {
    console.error('Error in updateTimeEntry:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Delete time entry
export async function deleteTimeEntry(
  id: string,
  projectId: string
): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('time_entries').delete().eq('id', id)

    if (error) {
      console.error('Error deleting time entry:', error)
      return { success: false, error: 'Kunne ikke slette tidsregistrering' }
    }

    revalidatePath(`/projects/${projectId}`)
    return { success: true }
  } catch (error) {
    console.error('Error in deleteTimeEntry:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ==================== Project from Offer ====================

// Create project from accepted offer
export async function createProjectFromOffer(
  offerId: string,
  customerId: string,
  offerTitle: string,
  offerFinalAmount: number
): Promise<ActionResult<Project>> {
  try {
    const supabase = await createClient()

    // Generate project number
    const projectNumber = await generateProjectNumber()

    // Get a system user ID (for auto-created projects)
    // Try to get the first admin user, or fall back to any user
    const { data: adminUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)
      .limit(1)
      .single()

    const createdBy = adminUser?.id

    if (!createdBy) {
      console.error('No admin user found for project creation')
      return { success: false, error: 'Ingen bruger fundet til projektoprettelse' }
    }

    // Create project
    const { data, error } = await supabase
      .from('projects')
      .insert({
        project_number: projectNumber,
        name: offerTitle,
        description: `Projekt oprettet automatisk fra tilbud. Tilbudsbeløb: ${offerFinalAmount.toLocaleString('da-DK')} DKK`,
        status: 'planning',
        priority: 'medium',
        customer_id: customerId,
        offer_id: offerId,
        budget: offerFinalAmount,
        created_by: createdBy,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating project from offer:', error)
      return { success: false, error: 'Kunne ikke oprette projekt' }
    }

    revalidatePath('/projects')
    return { success: true, data: data as Project }
  } catch (error) {
    console.error('Error in createProjectFromOffer:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ==================== Helpers ====================

// Get customers for dropdown
export async function getCustomersForProjectSelect(): Promise<
  ActionResult<{ id: string; company_name: string; customer_number: string }[]>
> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('customers')
      .select('id, company_name, customer_number')
      .eq('is_active', true)
      .order('company_name')

    if (error) {
      console.error('Error fetching customers:', error)
      return { success: false, error: 'Kunne ikke hente kunder' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in getCustomersForProjectSelect:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get team members for dropdown
export async function getTeamMembersForProject(): Promise<
  ActionResult<{ id: string; full_name: string | null; email: string }[]>
> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name')

    if (error) {
      console.error('Error fetching team members:', error)
      return { success: false, error: 'Kunne ikke hente teammedlemmer' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in getTeamMembersForProject:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get offers for dropdown (accepted offers for a customer)
export async function getOffersForProject(
  customerId: string
): Promise<ActionResult<{ id: string; offer_number: string; title: string }[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('offers')
      .select('id, offer_number, title')
      .eq('customer_id', customerId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching offers:', error)
      return { success: false, error: 'Kunne ikke hente tilbud' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in getOffersForProject:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get tasks for a project
export async function getProjectTasks(
  projectId: string
): Promise<ActionResult<ProjectTaskWithRelations[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('position')

    if (error) {
      console.error('Error fetching tasks:', error)
      return { success: false, error: 'Kunne ikke hente opgaver' }
    }

    return { success: true, data: data as ProjectTaskWithRelations[] }
  } catch (error) {
    console.error('Error in getProjectTasks:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get time entries for a project
export async function getProjectTimeEntries(
  projectId: string
): Promise<ActionResult<TimeEntryWithRelations[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('time_entries')
      .select(`
        *,
        task:project_tasks(id, title)
      `)
      .eq('project_id', projectId)
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching time entries:', error)
      return { success: false, error: 'Kunne ikke hente tidsregistreringer' }
    }

    return { success: true, data: data as TimeEntryWithRelations[] }
  } catch (error) {
    console.error('Error in getProjectTimeEntries:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
