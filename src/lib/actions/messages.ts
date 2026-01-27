'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import { createMessageSchema } from '@/lib/validations/messages'
import type {
  Message,
  MessageWithRelations,
  MessageStatus,
  MessageType,
  InboxFolder,
} from '@/types/messages.types'
import type { ActionResult } from '@/types/common.types'

// Get messages for inbox
export async function getMessages(
  folder: InboxFolder = 'inbox',
  filters?: {
    status?: MessageStatus
    message_type?: MessageType
    search?: string
    lead_id?: string
    customer_id?: string
    project_id?: string
  }
): Promise<ActionResult<MessageWithRelations[]>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    let query = supabase
      .from('messages')
      .select(`
        *,
        lead:leads(id, contact_person, company_name),
        customer:customers(id, company_name, customer_number),
        project:projects(id, project_number, name)
      `)

    // Filter by folder
    if (folder === 'inbox') {
      query = query.eq('to_user_id', user.id).neq('status', 'archived')
    } else if (folder === 'sent') {
      query = query.eq('from_user_id', user.id)
    } else if (folder === 'archived') {
      query = query.eq('to_user_id', user.id).eq('status', 'archived')
    }

    // Apply filters
    if (filters?.status && folder !== 'archived') {
      query = query.eq('status', filters.status)
    }

    if (filters?.message_type) {
      query = query.eq('message_type', filters.message_type)
    }

    if (filters?.search) {
      query = query.or(
        `subject.ilike.%${filters.search}%,body.ilike.%${filters.search}%`
      )
    }

    if (filters?.lead_id) {
      query = query.eq('lead_id', filters.lead_id)
    }

    if (filters?.customer_id) {
      query = query.eq('customer_id', filters.customer_id)
    }

    if (filters?.project_id) {
      query = query.eq('project_id', filters.project_id)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Error fetching messages:', error)
      return { success: false, error: 'Kunne ikke hente beskeder' }
    }

    return { success: true, data: data as MessageWithRelations[] }
  } catch (error) {
    console.error('Error in getMessages:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get single message with thread
export async function getMessage(
  id: string
): Promise<ActionResult<MessageWithRelations>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        lead:leads(id, contact_person, company_name),
        customer:customers(id, company_name, customer_number),
        project:projects(id, project_number, name)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching message:', error)
      return { success: false, error: 'Kunne ikke hente besked' }
    }

    // Get replies to this message
    const { data: replies } = await supabase
      .from('messages')
      .select('*')
      .eq('reply_to', id)
      .order('created_at', { ascending: true })

    return {
      success: true,
      data: { ...data, replies: replies || [] } as MessageWithRelations,
    }
  } catch (error) {
    console.error('Error in getMessage:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get unread count
export async function getUnreadCount(): Promise<ActionResult<number>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('to_user_id', user.id)
      .eq('status', 'unread')

    if (error) {
      console.error('Error fetching unread count:', error)
      return { success: false, error: 'Kunne ikke hente antal ulæste' }
    }

    return { success: true, data: count || 0 }
  } catch (error) {
    console.error('Error in getUnreadCount:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Create/send message
export async function sendMessage(
  formData: FormData
): Promise<ActionResult<Message>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const rawData = {
      subject: formData.get('subject') as string,
      body: formData.get('body') as string,
      message_type: (formData.get('message_type') as string) || 'internal',
      to_user_id: formData.get('to_user_id') as string,
      to_email: (formData.get('to_email') as string) || null,
      reply_to: (formData.get('reply_to') as string) || null,
      lead_id: (formData.get('lead_id') as string) || null,
      customer_id: (formData.get('customer_id') as string) || null,
      project_id: (formData.get('project_id') as string) || null,
    }

    const validated = createMessageSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const supabase = await createClient()

    // Get sender's profile info
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    const { data, error } = await supabase
      .from('messages')
      .insert({
        ...validated.data,
        from_user_id: user.id,
        from_name: profile?.full_name || null,
        from_email: profile?.email || user.email,
      })
      .select()
      .single()

    if (error) {
      console.error('Error sending message:', error)
      return { success: false, error: 'Kunne ikke sende besked' }
    }

    revalidatePath('/inbox')
    return { success: true, data: data as Message }
  } catch (error) {
    console.error('Error in sendMessage:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Mark message as read
export async function markAsRead(id: string): Promise<ActionResult<Message>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('messages')
      .update({
        read_at: new Date().toISOString(),
        status: 'read',
      })
      .eq('id', id)
      .eq('to_user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error marking as read:', error)
      return { success: false, error: 'Kunne ikke markere som læst' }
    }

    revalidatePath('/inbox')
    return { success: true, data: data as Message }
  } catch (error) {
    console.error('Error in markAsRead:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Mark message as unread
export async function markAsUnread(id: string): Promise<ActionResult<Message>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('messages')
      .update({
        read_at: null,
        status: 'unread',
      })
      .eq('id', id)
      .eq('to_user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error marking as unread:', error)
      return { success: false, error: 'Kunne ikke markere som ulæst' }
    }

    revalidatePath('/inbox')
    return { success: true, data: data as Message }
  } catch (error) {
    console.error('Error in markAsUnread:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Archive message
export async function archiveMessage(id: string): Promise<ActionResult<Message>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('messages')
      .update({
        archived_at: new Date().toISOString(),
        status: 'archived',
      })
      .eq('id', id)
      .eq('to_user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error archiving message:', error)
      return { success: false, error: 'Kunne ikke arkivere besked' }
    }

    revalidatePath('/inbox')
    return { success: true, data: data as Message }
  } catch (error) {
    console.error('Error in archiveMessage:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Unarchive message
export async function unarchiveMessage(
  id: string
): Promise<ActionResult<Message>> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('messages')
      .update({
        archived_at: null,
        status: 'read',
      })
      .eq('id', id)
      .eq('to_user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error unarchiving message:', error)
      return { success: false, error: 'Kunne ikke gendanne besked' }
    }

    revalidatePath('/inbox')
    return { success: true, data: data as Message }
  } catch (error) {
    console.error('Error in unarchiveMessage:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Delete message
export async function deleteMessage(id: string): Promise<ActionResult> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', id)
      .eq('to_user_id', user.id)

    if (error) {
      console.error('Error deleting message:', error)
      return { success: false, error: 'Kunne ikke slette besked' }
    }

    revalidatePath('/inbox')
    return { success: true }
  } catch (error) {
    console.error('Error in deleteMessage:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get team members for recipient dropdown
export async function getTeamMembersForMessage(): Promise<
  ActionResult<{ id: string; full_name: string | null; email: string }[]>
> {
  try {
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
      .neq('id', user.id) // Exclude current user
      .order('full_name')

    if (error) {
      console.error('Error fetching team members:', error)
      return { success: false, error: 'Kunne ikke hente teammedlemmer' }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in getTeamMembersForMessage:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get related entities for message linking
export async function getRelatedEntities(): Promise<
  ActionResult<{
    leads: { id: string; contact_person: string; company_name: string }[]
    customers: { id: string; company_name: string; customer_number: string }[]
    projects: { id: string; project_number: string; name: string }[]
  }>
> {
  try {
    const supabase = await createClient()

    const [leadsResult, customersResult, projectsResult] = await Promise.all([
      supabase
        .from('leads')
        .select('id, contact_person, company_name')
        .not('status', 'in', '("won","lost")')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('customers')
        .select('id, company_name, customer_number')
        .eq('is_active', true)
        .order('company_name')
        .limit(50),
      supabase
        .from('projects')
        .select('id, project_number, name')
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    return {
      success: true,
      data: {
        leads: leadsResult.data || [],
        customers: customersResult.data || [],
        projects: projectsResult.data || [],
      },
    }
  } catch (error) {
    console.error('Error in getRelatedEntities:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
