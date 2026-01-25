'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import { createLeadSchema, updateLeadSchema } from '@/lib/validations/leads'
import type { Lead, LeadWithRelations, LeadActivity, LeadStatus } from '@/types/leads.types'

export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// Get all leads with optional filtering
export async function getLeads(filters?: {
  search?: string
  status?: LeadStatus
  source?: string
  assigned_to?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}): Promise<ActionResult<LeadWithRelations[]>> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('leads')
      .select('*')

    // Apply filters
    if (filters?.search) {
      query = query.or(
        `company_name.ilike.%${filters.search}%,contact_person.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
      )
    }

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.source) {
      query = query.eq('source', filters.source)
    }

    if (filters?.assigned_to) {
      query = query.eq('assigned_to', filters.assigned_to)
    }

    // Apply sorting
    const sortBy = filters?.sortBy || 'created_at'
    const sortOrder = filters?.sortOrder || 'desc'
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })

    const { data, error } = await query

    if (error) {
      console.error('Error fetching leads:', error)
      return { success: false, error: 'Kunne ikke hente leads' }
    }

    return { success: true, data: data as LeadWithRelations[] }
  } catch (error) {
    console.error('Error in getLeads:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get single lead by ID
export async function getLead(id: string): Promise<ActionResult<LeadWithRelations>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching lead:', error)
      return { success: false, error: 'Kunne ikke hente lead' }
    }

    return { success: true, data: data as LeadWithRelations }
  } catch (error) {
    console.error('Error in getLead:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Create new lead
export async function createLead(formData: FormData): Promise<ActionResult<Lead>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    // Get form values
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
      console.error('Validation errors:', validated.error.errors)
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    // Build insert object, excluding null/undefined values and tags
    const insertData: Record<string, unknown> = {
      company_name: validated.data.company_name,
      contact_person: validated.data.contact_person,
      email: validated.data.email,
      status: validated.data.status,
      source: validated.data.source,
      created_by: user.id,
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
      console.error('Error creating lead:', error)
      return { success: false, error: `Database fejl: ${error.message}` }
    }

    revalidatePath('/leads')
    return { success: true, data: data as Lead }
  } catch (error) {
    console.error('Error in createLead:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update lead
export async function updateLead(formData: FormData): Promise<ActionResult<Lead>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Lead ID mangler' }
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
      assigned_to: formData.get('assigned_to') as string || null,
    }

    const validated = updateLeadSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    // Get old status for activity logging
    const { data: oldLead } = await supabase
      .from('leads')
      .select('status')
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
      console.error('Error updating lead:', error)
      return { success: false, error: 'Kunne ikke opdatere lead' }
    }

    // Log status change if changed
    if (oldLead && oldLead.status !== data.status) {
      await supabase.from('lead_activities').insert({
        lead_id: data.id,
        activity_type: 'status_change',
        description: `Status ændret fra "${oldLead.status}" til "${data.status}"`,
        performed_by: user.id,
      })
    }

    revalidatePath('/leads')
    revalidatePath(`/leads/${leadId}`)
    return { success: true, data: data as Lead }
  } catch (error) {
    console.error('Error in updateLead:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Delete lead
export async function deleteLead(id: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { error } = await supabase.from('leads').delete().eq('id', id)

    if (error) {
      console.error('Error deleting lead:', error)
      return { success: false, error: 'Kunne ikke slette lead' }
    }

    revalidatePath('/leads')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteLead:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update lead status only
export async function updateLeadStatus(
  id: string,
  status: LeadStatus
): Promise<ActionResult<Lead>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

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
      console.error('Error updating lead status:', error)
      return { success: false, error: 'Kunne ikke opdatere status' }
    }

    // Log activity
    if (oldLead && oldLead.status !== status) {
      await supabase.from('lead_activities').insert({
        lead_id: id,
        activity_type: 'status_change',
        description: `Status ændret fra "${oldLead.status}" til "${status}"`,
        performed_by: user.id,
      })
    }

    revalidatePath('/leads')
    revalidatePath(`/leads/${id}`)
    return { success: true, data: data as Lead }
  } catch (error) {
    console.error('Error in updateLeadStatus:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get lead activities
export async function getLeadActivities(
  leadId: string
): Promise<ActionResult<LeadActivity[]>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('lead_activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching lead activities:', error)
      return { success: false, error: 'Kunne ikke hente aktiviteter' }
    }

    return { success: true, data: data as LeadActivity[] }
  } catch (error) {
    console.error('Error in getLeadActivities:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Add activity to lead
export async function addLeadActivity(
  leadId: string,
  activityType: string,
  description: string
): Promise<ActionResult<LeadActivity>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('lead_activities')
      .insert({
        lead_id: leadId,
        activity_type: activityType,
        description,
        performed_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding lead activity:', error)
      return { success: false, error: 'Kunne ikke tilføje aktivitet' }
    }

    revalidatePath(`/leads/${leadId}`)
    return { success: true, data: data as LeadActivity }
  } catch (error) {
    console.error('Error in addLeadActivity:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get team members for assignment dropdown
export async function getTeamMembers(): Promise<
  ActionResult<{ id: string; full_name: string | null; email: string }[]>
> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name')

    if (error) {
      console.error('Error fetching team members:', error)
      return { success: false, error: 'Kunne ikke hente teammedlemmer' }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error in getTeamMembers:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
