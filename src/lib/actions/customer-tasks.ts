'use server'

/**
 * Server Actions — Customer Tasks (Opgaver)
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'
import { sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import { generateBesigtigelseICS } from '@/lib/utils/ics'
import { APP_URL } from '@/lib/constants'
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
// BESIGTIGELSE (Book inspection visit)
// =====================================================

export async function bookBesigtigelse(
  customerId: string,
  customerName: string,
  customerEmail: string,
  date: string,
  time: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Ikke logget ind' }

    // Format date for display (e.g. "18. marts 2026")
    const dateObj = new Date(date)
    const formattedDate = dateObj.toLocaleDateString('da-DK', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    // Fetch customer address + portal token
    const { data: customer } = await supabase
      .from('customers')
      .select('billing_address, billing_city, billing_postal_code, shipping_address, shipping_city, shipping_postal_code')
      .eq('id', customerId)
      .single()

    const { data: portalTokens } = await supabase
      .from('portal_access_tokens')
      .select('token')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)

    const portalToken = portalTokens?.[0]?.token
    const portalUrl = portalToken ? `${APP_URL}/portal/${portalToken}` : null

    // Build customer address string
    const address = customer?.shipping_address || customer?.billing_address || ''
    const city = customer?.shipping_city || customer?.billing_city || ''
    const postal = customer?.shipping_postal_code || customer?.billing_postal_code || ''
    const fullAddress = [address, `${postal} ${city}`.trim()].filter(Boolean).join(', ')

    // Generate ICS calendar file
    const icsContent = generateBesigtigelseICS({
      title: 'Besigtigelse: Elta Solar',
      location: fullAddress || undefined,
      description: portalUrl
        ? `Vi glæder os til at se dig. Du kan altid finde dine dokumenter og detaljer her: ${portalUrl}`
        : 'Vi glæder os til at se dig.',
      startDate: date,
      startTime: time,
    })

    // Send confirmation email via Graph API
    const subject = `Bekræftelse: Besigtigelse d. ${formattedDate}`
    const html = `
      <!DOCTYPE html>
      <html lang="da">
      <head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f4f4f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
          <tr>
            <td style="background-color:#1e3a5f;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Elta Solar</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:18px;">Bekræftelse af besigtigelse</h2>
              <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
                Kære ${customerName},
              </p>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
                Vi bekræfter hermed jeres besigtigelse på følgende tidspunkt:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                    <strong style="color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Dato</strong><br/>
                    <span style="color:#1e293b;font-size:15px;">${formattedDate}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <strong style="color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Tidspunkt</strong><br/>
                    <span style="color:#1e293b;font-size:15px;">${time}</span>
                  </td>
                </tr>
              </table>
              ${notes ? `
              <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">
                <strong>Bemærkninger:</strong>
              </p>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;background-color:#f8fafc;padding:12px 16px;border-radius:6px;border-left:3px solid #1e3a5f;">
                ${notes}
              </p>
              ` : ''}
              ${portalUrl ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                <tr>
                  <td align="center">
                    <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#1e40af;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
                      Se din besigtigelse i kundeportalen
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
              <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
                Har du spørgsmål eller ønsker at ændre tidspunktet, er du velkommen til at kontakte os.
              </p>
              <p style="margin:24px 0 0;color:#374151;font-size:15px;line-height:1.6;">
                Med venlig hilsen,<br/>
                <strong>Elta Solar ApS</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                Elta Solar ApS &bull; Denne e-mail er sendt automatisk
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `.trim()

    const emailResult = await sendEmailViaGraph({
      to: customerEmail,
      subject,
      html,
      attachments: [
        {
          filename: 'besigtigelse.ics',
          content: Buffer.from(icsContent, 'utf-8'),
          contentType: 'text/calendar',
        },
      ],
    })
    if (!emailResult.success) {
      logger.error('Failed to send besigtigelse confirmation email', {
        error: emailResult.error,
        entityId: customerId,
      })
      return { success: false, error: `Kunne ikke sende bekræftelses-email: ${emailResult.error}` }
    }

    // Create a customer task for the inspection visit
    const description = [
      `Besigtigelse planlagt d. ${formattedDate} kl. ${time}`,
      fullAddress ? `Adresse: ${fullAddress}` : null,
      notes ? `Bemærkninger: ${notes}` : null,
      `Bekræftelses-email sendt til ${customerEmail}`,
    ]
      .filter(Boolean)
      .join('\n')

    const { error: taskError } = await supabase.from('customer_tasks').insert({
      customer_id: customerId,
      title: `Besigtigelse hos ${customerName}`,
      description,
      priority: 'high',
      due_date: date,
      assigned_to: user.id,
      created_by: user.id,
    })

    if (taskError) {
      logger.error('Failed to create besigtigelse task', { error: taskError, entityId: customerId })
      return { success: false, error: taskError.message }
    }

    revalidatePath('/dashboard/customers')
    revalidatePath('/dashboard/tasks')
    revalidatePath('/dashboard/calendar')
    return { success: true }
  } catch (err) {
    logger.error('Unexpected error in bookBesigtigelse', { error: err })
    return { success: false, error: 'Uventet fejl ved booking af besigtigelse' }
  }
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
      .in('alert_type', ['price_change', 'price_increase', 'price_decrease', 'margin_below'])
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
