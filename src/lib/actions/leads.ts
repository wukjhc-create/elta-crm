'use server'

import { revalidatePath } from 'next/cache'
import { createLeadSchema, updateLeadSchema } from '@/lib/validations/leads'
import { validateUUID, sanitizeSearchTerm } from '@/lib/validations/common'
import { logCreate, logUpdate, logDelete, logStatusChange } from '@/lib/actions/audit'
import type { Lead, LeadWithRelations, LeadActivity, LeadStatus } from '@/types/leads.types'
import type { PaginatedResponse, ActionResult } from '@/types/common.types'
import { DEFAULT_PAGE_SIZE } from '@/types/common.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'

// Get all leads with optional filtering and pagination
export async function getLeads(filters?: {
  search?: string
  status?: LeadStatus
  source?: string
  assigned_to?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}): Promise<ActionResult<PaginatedResponse<LeadWithRelations>>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const page = filters?.page || 1
    const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE
    const offset = (page - 1) * pageSize

    // Validate assigned_to if provided
    if (filters?.assigned_to) {
      validateUUID(filters.assigned_to, 'tildelt bruger ID')
    }

    // Build count query
    let countQuery = supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })

    // Build data query
    let dataQuery = supabase
      .from('leads')
      .select('*')

    // Apply filters with sanitized search
    if (filters?.search) {
      const sanitized = sanitizeSearchTerm(filters.search)
      const searchFilter = `company_name.ilike.%${sanitized}%,contact_person.ilike.%${sanitized}%,email.ilike.%${sanitized}%`
      countQuery = countQuery.or(searchFilter)
      dataQuery = dataQuery.or(searchFilter)
    }

    if (filters?.status) {
      countQuery = countQuery.eq('status', filters.status)
      dataQuery = dataQuery.eq('status', filters.status)
    }

    if (filters?.source) {
      countQuery = countQuery.eq('source', filters.source)
      dataQuery = dataQuery.eq('source', filters.source)
    }

    if (filters?.assigned_to) {
      countQuery = countQuery.eq('assigned_to', filters.assigned_to)
      dataQuery = dataQuery.eq('assigned_to', filters.assigned_to)
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
      console.error('Database error counting leads:', countResult.error)
      throw new Error('DATABASE_ERROR')
    }

    if (dataResult.error) {
      console.error('Database error fetching leads:', dataResult.error)
      throw new Error('DATABASE_ERROR')
    }

    const total = countResult.count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
      success: true,
      data: {
        data: dataResult.data as LeadWithRelations[],
        total,
        page,
        pageSize,
        totalPages,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leads') }
  }
}

// Get single lead by ID
export async function getLead(id: string): Promise<ActionResult<LeadWithRelations>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'lead ID')

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Lead blev ikke fundet' }
      }
      console.error('Database error fetching lead:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data as LeadWithRelations }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente lead') }
  }
}

// Create new lead
export async function createLead(formData: FormData): Promise<ActionResult<Lead>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Get and validate form values
    const company_name = formData.get('company_name') as string
    const contact_person = formData.get('contact_person') as string
    const email = formData.get('email') as string
    const phone = formData.get('phone') as string
    const status = (formData.get('status') as string) || 'new'
    const source = (formData.get('source') as string) || 'other'
    const valueStr = formData.get('value') as string
    const probabilityStr = formData.get('probability') as string
    const expected_close_date = formData.get('expected_close_date') as string
    const notes = formData.get('notes') as string
    const assigned_to = formData.get('assigned_to') as string

    if (assigned_to) {
      validateUUID(assigned_to, 'tildelt bruger ID')
    }

    const rawData = {
      company_name,
      contact_person,
      email,
      phone: phone || '',
      status,
      source,
      value: valueStr ? Number(valueStr) : null,
      probability: probabilityStr ? Number(probabilityStr) : null,
      expected_close_date: expected_close_date || '',
      notes: notes || '',
      assigned_to: assigned_to || '',
      tags: [],
    }

    const validated = createLeadSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    // Build insert object, excluding null/undefined values and tags
    const insertData: Record<string, unknown> = {
      company_name: validated.data.company_name,
      contact_person: validated.data.contact_person,
      email: validated.data.email,
      status: validated.data.status,
      source: validated.data.source,
      created_by: userId,
    }

    // Only add optional fields if they have values
    if (validated.data.phone) insertData.phone = validated.data.phone
    if (validated.data.value !== null && validated.data.value !== undefined) insertData.value = validated.data.value
    if (validated.data.probability !== null && validated.data.probability !== undefined) insertData.probability = validated.data.probability
    if (validated.data.expected_close_date) insertData.expected_close_date = validated.data.expected_close_date
    if (validated.data.notes) insertData.notes = validated.data.notes
    if (validated.data.assigned_to) insertData.assigned_to = validated.data.assigned_to

    const { data, error } = await supabase
      .from('leads')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Den valgte bruger findes ikke' }
      }
      console.error('Database error creating lead:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Log lead creation activity
    await supabase.from('lead_activities').insert({
      lead_id: data.id,
      activity_type: 'created',
      description: `Lead oprettet for "${data.company_name}"`,
      performed_by: userId,
    })

    // Audit log
    await logCreate('lead', data.id, data.company_name, {
      source: data.source,
      status: data.status,
    })

    revalidatePath('/leads')
    return { success: true, data: data as Lead }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette lead') }
  }
}

// Update lead
export async function updateLead(formData: FormData): Promise<ActionResult<Lead>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Lead ID mangler' }
    }
    validateUUID(id, 'lead ID')

    const assignedTo = formData.get('assigned_to') as string || null
    if (assignedTo) {
      validateUUID(assignedTo, 'tildelt bruger ID')
    }

    const rawData = {
      id,
      company_name: formData.get('company_name') as string,
      contact_person: formData.get('contact_person') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string || null,
      status: formData.get('status') as string,
      source: formData.get('source') as string,
      value: formData.get('value') ? Number(formData.get('value')) : null,
      probability: formData.get('probability') ? Number(formData.get('probability')) : null,
      expected_close_date: formData.get('expected_close_date') as string || null,
      notes: formData.get('notes') as string || null,
      assigned_to: assignedTo,
    }

    const validated = updateLeadSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    // Get old lead data for activity logging
    const { data: oldLead } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    const { id: leadId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Lead blev ikke fundet' }
      }
      if (error.code === '23503') {
        return { success: false, error: 'Den valgte bruger findes ikke' }
      }
      console.error('Database error updating lead:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Log activities for changes
    const activities: { activity_type: string; description: string }[] = []

    if (oldLead) {
      // Status change
      if (oldLead.status !== data.status) {
        activities.push({
          activity_type: 'status_change',
          description: `Status ændret fra "${oldLead.status}" til "${data.status}"`,
        })
      }

      // Assignment change
      if (oldLead.assigned_to !== data.assigned_to) {
        if (data.assigned_to) {
          activities.push({
            activity_type: 'assigned',
            description: 'Lead tildelt ny ansvarlig',
          })
        } else {
          activities.push({
            activity_type: 'unassigned',
            description: 'Tildeling fjernet fra lead',
          })
        }
      }

      // Value change
      if (oldLead.value !== data.value) {
        const oldVal = oldLead.value ? `${oldLead.value} DKK` : 'ikke angivet'
        const newVal = data.value ? `${data.value} DKK` : 'ikke angivet'
        activities.push({
          activity_type: 'value_change',
          description: `Værdi ændret fra ${oldVal} til ${newVal}`,
        })
      }

      // Generic update if other fields changed
      if (activities.length === 0) {
        activities.push({
          activity_type: 'updated',
          description: 'Lead oplysninger opdateret',
        })
      }
    }

    // Insert all activities
    if (activities.length > 0) {
      await supabase.from('lead_activities').insert(
        activities.map((a) => ({
          lead_id: data.id,
          activity_type: a.activity_type,
          description: a.description,
          performed_by: userId,
        }))
      )
    }

    // Audit log
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    if (oldLead) {
      if (oldLead.status !== data.status) {
        changes.status = { old: oldLead.status, new: data.status }
      }
      if (oldLead.value !== data.value) {
        changes.value = { old: oldLead.value, new: data.value }
      }
      if (oldLead.assigned_to !== data.assigned_to) {
        changes.assigned_to = { old: oldLead.assigned_to, new: data.assigned_to }
      }
    }
    await logUpdate('lead', leadId, data.company_name, changes)

    revalidatePath('/leads')
    revalidatePath(`/leads/${leadId}`)
    return { success: true, data: data as Lead }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere lead') }
  }
}

// Delete lead
export async function deleteLead(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(id, 'lead ID')

    // Get lead name before deleting for audit log
    const { data: lead } = await supabase
      .from('leads')
      .select('company_name')
      .eq('id', id)
      .single()

    const { error } = await supabase.from('leads').delete().eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Lead kan ikke slettes da det har tilknyttede data' }
      }
      console.error('Database error deleting lead:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Audit log
    await logDelete('lead', id, lead?.company_name || 'Ukendt')

    revalidatePath('/leads')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette lead') }
  }
}

// Update lead status only
export async function updateLeadStatus(
  id: string,
  status: LeadStatus
): Promise<ActionResult<Lead>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(id, 'lead ID')

    // Get old status
    const { data: oldLead } = await supabase
      .from('leads')
      .select('status')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('leads')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Lead blev ikke fundet' }
      }
      console.error('Database error updating lead status:', error)
      throw new Error('DATABASE_ERROR')
    }

    // Log activity
    if (oldLead && oldLead.status !== status) {
      await supabase.from('lead_activities').insert({
        lead_id: id,
        activity_type: 'status_change',
        description: `Status ændret fra "${oldLead.status}" til "${status}"`,
        performed_by: userId,
      })

      // Audit log
      await logStatusChange('lead', id, data.company_name, oldLead.status, status)
    }

    revalidatePath('/leads')
    revalidatePath(`/leads/${id}`)
    return { success: true, data: data as Lead }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere status') }
  }
}

// Get lead activities
export async function getLeadActivities(
  leadId: string
): Promise<ActionResult<LeadActivity[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    validateUUID(leadId, 'lead ID')

    const { data, error } = await supabase
      .from('lead_activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error fetching lead activities:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as LeadActivity[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente aktiviteter') }
  }
}

// Add activity to lead
export async function addLeadActivity(
  leadId: string,
  activityType: string,
  description: string
): Promise<ActionResult<LeadActivity>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()
    validateUUID(leadId, 'lead ID')

    const { data, error } = await supabase
      .from('lead_activities')
      .insert({
        lead_id: leadId,
        activity_type: activityType,
        description,
        performed_by: userId,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23503') {
        return { success: false, error: 'Lead findes ikke' }
      }
      console.error('Database error adding lead activity:', error)
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath(`/leads/${leadId}`)
    return { success: true, data: data as LeadActivity }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke tilføje aktivitet') }
  }
}

// Get team members for assignment dropdown
export async function getTeamMembers(): Promise<
  ActionResult<{ id: string; full_name: string | null; email: string }[]>
> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name')

    if (error) {
      console.error('Database error fetching team members:', error)
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente teammedlemmer') }
  }
}
