'use server'

/**
 * Server Actions — Customer Tasks (Opgaver)
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'
import type {
  CustomerTaskWithRelations,
  CreateCustomerTaskInput,
  UpdateCustomerTaskInput,
} from '@/types/customer-tasks.types'

// =====================================================
// HELPERS
// =====================================================

type ProfileMap = Record<string, { id: string; full_name: string | null; email: string }>

async function enrichWithProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tasks: CustomerTaskWithRelations[]
): Promise<CustomerTaskWithRelations[]> {
  const assignedIds = [...new Set(tasks.map((t) => t.assigned_to).filter(Boolean))] as string[]
  if (assignedIds.length === 0) return tasks

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', assignedIds)

  const profileMap: ProfileMap = {}
  for (const p of profiles || []) {
    profileMap[p.id] = p
  }

  return tasks.map((t) => ({
    ...t,
    assigned_profile: t.assigned_to ? profileMap[t.assigned_to] || null : null,
  }))
}

// =====================================================
// READ
// =====================================================

export async function getCustomerTasks(
  customerId: string
): Promise<CustomerTaskWithRelations[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('customer_tasks')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('Failed to fetch customer tasks', { error, entityId: customerId })
    return []
  }

  return enrichWithProfiles(supabase, (data || []) as CustomerTaskWithRelations[])
}

export async function getAllTasks(options?: {
  status?: string
  priority?: string
  assignedTo?: string
  search?: string
}): Promise<CustomerTaskWithRelations[]> {
  const supabase = await createClient()

  let query = supabase
    .from('customer_tasks')
    .select(`
      *,
      customer:customers (
        id,
        company_name,
        customer_number
      ),
      offer:offers (
        id,
        title,
        offer_number
      )
    `)
    .order('created_at', { ascending: false })

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status)
  }
  if (options?.priority && options.priority !== 'all') {
    query = query.eq('priority', options.priority)
  }
  if (options?.assignedTo && options.assignedTo !== 'all') {
    query = query.eq('assigned_to', options.assignedTo)
  }
  if (options?.search) {
    query = query.ilike('title', `%${options.search}%`)
  }

  const { data, error } = await query

  if (error) {
    logger.error('Failed to fetch all tasks', { error })
    return []
  }

  return enrichWithProfiles(supabase, (data || []) as CustomerTaskWithRelations[])
}

export async function getMyPendingReminders(): Promise<CustomerTaskWithRelations[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('customer_tasks')
    .select(`
      *,
      customer:customers (
        id,
        company_name,
        customer_number
      ),
      offer:offers (
        id,
        title,
        offer_number
      )
    `)
    .eq('assigned_to', user.id)
    .neq('status', 'done')
    .lte('reminder_at', now)
    .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
    .order('reminder_at', { ascending: true })

  if (error) {
    logger.error('Failed to fetch reminders', { error })
    return []
  }

  return enrichWithProfiles(supabase, (data || []) as CustomerTaskWithRelations[])
}

export async function getActiveProfiles(): Promise<
  Array<{ id: string; full_name: string | null; email: string }>
> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .order('full_name', { ascending: true })

  if (error) {
    logger.error('Failed to fetch profiles', { error })
    return []
  }

  return data || []
}

// =====================================================
// WRITE
// =====================================================

export async function createCustomerTask(
  input: CreateCustomerTaskInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Ikke logget ind' }

  const { error } = await supabase.from('customer_tasks').insert({
    customer_id: input.customer_id,
    offer_id: input.offer_id || null,
    title: input.title,
    description: input.description || null,
    priority: input.priority || 'normal',
    assigned_to: input.assigned_to || user.id,
    due_date: input.due_date || null,
    reminder_at: input.reminder_at || null,
    created_by: user.id,
  })

  if (error) {
    logger.error('Failed to create customer task', { error })
    return { success: false, error: error.message }
  }

  revalidatePath(`/dashboard/customers/${input.customer_id}`)
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard/offers')
  return { success: true }
}

export async function updateCustomerTask(
  input: UpdateCustomerTaskInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (input.title !== undefined) updates.title = input.title
  if (input.description !== undefined) updates.description = input.description
  if (input.status !== undefined) updates.status = input.status
  if (input.priority !== undefined) updates.priority = input.priority
  if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to
  if (input.due_date !== undefined) updates.due_date = input.due_date
  if (input.reminder_at !== undefined) updates.reminder_at = input.reminder_at
  if (input.snoozed_until !== undefined) updates.snoozed_until = input.snoozed_until

  const { error } = await supabase
    .from('customer_tasks')
    .update(updates)
    .eq('id', input.id)

  if (error) {
    logger.error('Failed to update customer task', { error, entityId: input.id })
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/customers')
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

export async function completeCustomerTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('customer_tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    logger.error('Failed to complete customer task', { error, entityId: taskId })
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/customers')
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

export async function deleteCustomerTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('customer_tasks')
    .delete()
    .eq('id', taskId)

  if (error) {
    logger.error('Failed to delete customer task', { error, entityId: taskId })
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/customers')
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

export async function snoozeTask(
  taskId: string,
  until: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('customer_tasks')
    .update({
      snoozed_until: until,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)

  if (error) {
    logger.error('Failed to snooze task', { error, entityId: taskId })
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/customers')
  revalidatePath('/dashboard/tasks')
  return { success: true }
}

// =====================================================
// PRICE ALERTS (system_alerts)
// =====================================================

export interface PriceAlert {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string
  details: Record<string, unknown>
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  created_at: string
}

export async function getUnreadPriceAlerts(): Promise<PriceAlert[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('system_alerts')
      .select('*')
      .eq('alert_type', 'price_change')
      .eq('is_read', false)
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      logger.error('Failed to fetch price alerts', { error })
      return []
    }

    return data || []
  } catch {
    return []
  }
}

export async function dismissPriceAlert(
  alertId: string
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('system_alerts')
      .update({
        is_dismissed: true,
        dismissed_at: new Date().toISOString(),
      })
      .eq('id', alertId)

    if (error) {
      logger.error('Failed to dismiss price alert', { error })
      return { success: false }
    }

    return { success: true }
  } catch {
    return { success: false }
  }
}

export async function markPriceAlertRead(
  alertId: string
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('system_alerts')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', alertId)

    if (error) return { success: false }
    return { success: true }
  } catch {
    return { success: false }
  }
}
