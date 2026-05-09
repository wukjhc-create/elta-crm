'use server'

/**
 * Sprint 8C-1 — Send mail fra task-context.
 *
 * Erstatter mailto: fra Sprint 8B-1 med intern CRM-mail.
 * Mail sendes via Microsoft Graph (eksisterende `sendEmailViaGraph`).
 * Mail logges i `email_threads` + `email_messages` knyttet til kunde
 * (og tilbud hvis task har offer_id). Soft-ref til task gemmes i
 * `email_messages.template_variables.task_id` (uden FK — task-FK
 * kommer i en senere migration).
 *
 * Permission: tasks.edit (admin, serviceleder, montør).
 * Scope: montør må kun maile fra tasks tildelt egen profile.id.
 *
 * Hvis Graph-send fejler → message-rowen markeres status='failed'
 * og fejlen returneres til UI. Mail markeres ALDRIG som sendt
 * uden faktisk at være sendt.
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import {
  isGraphConfigured,
  sendEmailViaGraph,
  getMailbox,
} from '@/lib/services/microsoft-graph'
import { logger } from '@/lib/utils/logger'
import { validateUUID } from '@/lib/validations/common'
import crypto from 'crypto'

export interface SendTaskEmailInput {
  task_id: string
  to: string
  cc?: string
  subject: string
  body: string
}

export interface SendTaskEmailResult {
  success: boolean
  thread_id?: string
  message_id?: string
  error?: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function generateTrackingId(): string {
  return crypto.randomBytes(16).toString('hex')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function plainTextToHtml(plain: string, senderName: string | null): string {
  const escaped = escapeHtml(plain).replace(/\n/g, '<br>')
  const signature = senderName
    ? `<br><br>--<br>${escapeHtml(senderName)}<br>Elta Solar`
    : `<br><br>--<br>Elta Solar`
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222;">${escaped}${signature}</body></html>`
}

export async function sendTaskEmail(
  input: SendTaskEmailInput
): Promise<SendTaskEmailResult> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { supabase, userId, role, hasPermission } = ctx

    if (!hasPermission('tasks.edit')) {
      return { success: false, error: 'Du har ikke adgang til at sende mail fra opgaver' }
    }

    validateUUID(input.task_id, 'task ID')

    const to = (input.to || '').trim().toLowerCase()
    const cc = (input.cc || '').trim().toLowerCase()
    // Defense-in-depth: strip CR/LF fra subject for at undgå header-injection
    // selvom Graph også sanitizer. body bevarer linjeskift.
    const subject = (input.subject || '').trim().replace(/[\r\n]+/g, ' ')
    const body = (input.body || '').trim()

    if (!EMAIL_REGEX.test(to)) {
      return { success: false, error: 'Ugyldig modtager-emailadresse' }
    }
    if (cc && !EMAIL_REGEX.test(cc)) {
      return { success: false, error: 'Ugyldig Cc-emailadresse' }
    }
    if (!subject) {
      return { success: false, error: 'Emne mangler' }
    }
    if (!body) {
      return { success: false, error: 'Brødtekst mangler' }
    }
    if (subject.length > 500) {
      return { success: false, error: 'Emne er for langt (max 500 tegn)' }
    }
    if (body.length > 50_000) {
      return { success: false, error: 'Brødtekst er for lang (max 50.000 tegn)' }
    }

    if (!isGraphConfigured()) {
      return {
        success: false,
        error: 'Microsoft Graph er ikke konfigureret. Kontakt admin for at aktivere intern mailafsendelse.',
      }
    }

    const { data: task, error: taskError } = await supabase
      .from('customer_tasks')
      .select('id, title, customer_id, offer_id, assigned_to')
      .eq('id', input.task_id)
      .maybeSingle()

    if (taskError || !task) {
      return { success: false, error: 'Opgave ikke fundet' }
    }

    if (role === 'montør' && task.assigned_to !== userId) {
      return { success: false, error: 'Du kan kun sende mail fra opgaver, der er tildelt dig' }
    }

    if (!task.customer_id) {
      return { success: false, error: 'Opgaven har ingen tilknyttet kunde' }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()
    const senderName: string | null = profile?.full_name || null

    const fromEmail = getMailbox()
    const trackingId = generateTrackingId()
    const bodyHtml = plainTextToHtml(body, senderName)
    const bodyText = body
    const ccArr = cc ? [cc] : null

    let threadId: string | null = null
    if (task.offer_id) {
      const { data: existingThreads } = await supabase
        .from('email_threads')
        .select('id')
        .eq('offer_id', task.offer_id)
        .order('created_at', { ascending: false })
        .limit(1)
      if (existingThreads && existingThreads.length > 0) {
        threadId = existingThreads[0].id
      }
    }

    if (!threadId) {
      const { data: newThread, error: threadErr } = await supabase
        .from('email_threads')
        .insert({
          customer_id: task.customer_id,
          offer_id: task.offer_id || null,
          subject,
          status: 'draft',
          created_by: userId,
        })
        .select('id')
        .single()
      if (threadErr || !newThread) {
        logger.error('sendTaskEmail: failed to create email_thread', {
          error: threadErr,
          metadata: { task_id: task.id, customer_id: task.customer_id },
        })
        return { success: false, error: 'Kunne ikke oprette mail-tråd' }
      }
      threadId = newThread.id
    }

    const { data: messageRow, error: messageErr } = await supabase
      .from('email_messages')
      .insert({
        thread_id: threadId,
        direction: 'outbound',
        from_email: fromEmail,
        from_name: senderName ? `${senderName} | Elta Solar` : 'Elta Solar',
        to_email: to,
        cc: ccArr,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        template_variables: { task_id: task.id, source: 'task-mail-dialog' },
        status: 'queued',
        tracking_id: trackingId,
        queued_at: new Date().toISOString(),
        created_by: userId,
      })
      .select('id')
      .single()

    if (messageErr || !messageRow) {
      logger.error('sendTaskEmail: failed to create email_message', {
        error: messageErr,
        metadata: { task_id: task.id, thread_id: threadId },
      })
      return { success: false, error: 'Kunne ikke oprette mail-besked' }
    }

    const messageRowId = messageRow.id

    const sendResult = await sendEmailViaGraph({
      to,
      subject,
      html: bodyHtml,
      text: bodyText,
      replyTo: fromEmail,
      senderName: senderName || undefined,
    })

    if (!sendResult.success) {
      await supabase
        .from('email_messages')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: sendResult.error || 'Ukendt fejl ved afsendelse',
        })
        .eq('id', messageRowId)

      logger.error('sendTaskEmail: Graph send failed', {
        userId,
        action: 'sendTaskEmail',
        entity: 'customer_tasks',
        entityId: task.id,
        metadata: { thread_id: threadId, message_id: messageRowId, error: sendResult.error },
      })

      return {
        success: false,
        error: sendResult.error || 'Mail kunne ikke sendes',
        thread_id: threadId || undefined,
        message_id: messageRowId,
      }
    }

    const sentAt = new Date().toISOString()
    await supabase
      .from('email_messages')
      .update({
        status: 'sent',
        sent_at: sentAt,
        message_id: sendResult.messageId || null,
      })
      .eq('id', messageRowId)

    try {
      await supabase
        .from('incoming_emails')
        .insert({
          graph_message_id:
            sendResult.messageId ||
            `task-mail-${messageRowId}-${Date.now()}`,
          subject,
          sender_email: fromEmail,
          sender_name: senderName ? `${senderName} | Elta Solar` : 'Elta Solar',
          to_email: to,
          cc: ccArr || [],
          body_html: bodyHtml,
          body_text: bodyText,
          body_preview: subject.substring(0, 200),
          has_attachments: false,
          is_read: true,
          received_at: sentAt,
          link_status: 'linked',
          customer_id: task.customer_id,
          linked_by: 'auto',
          linked_at: sentAt,
          processed_at: sentAt,
        })
    } catch (mirrorErr) {
      logger.warn('sendTaskEmail: failed to mirror to incoming_emails', {
        error: mirrorErr,
        metadata: { task_id: task.id, message_id: messageRowId },
      })
    }

    logger.info('sendTaskEmail: mail sent', {
      userId,
      action: 'sendTaskEmail',
      entity: 'customer_tasks',
      entityId: task.id,
      metadata: {
        thread_id: threadId || undefined,
        message_id: messageRowId,
        graph_message_id: sendResult.messageId,
        offer_id: task.offer_id,
      },
    })

    revalidatePath('/dashboard/tasks')
    revalidatePath(`/dashboard/customers/${task.customer_id}`)
    if (task.offer_id) revalidatePath(`/dashboard/offers/${task.offer_id}`)

    return {
      success: true,
      thread_id: threadId || undefined,
      message_id: messageRowId,
    }
  } catch (error) {
    logger.error('sendTaskEmail: unexpected error', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Uventet fejl ved afsendelse af mail',
    }
  }
}

export async function isTaskMailConfigured(): Promise<boolean> {
  return isGraphConfigured()
}
