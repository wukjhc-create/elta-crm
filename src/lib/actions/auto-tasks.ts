'use server'

/**
 * Sprint 8E-1B — Auto-tasks for ubesvarede kunde-mails.
 *
 * Hovedflow:
 * 1. createAutoTasksForUnansweredEmails(): for hver ubesvarede mail-tråd
 *    der har været åben i >= 24 timer → opret én customer_task.
 *    Conversation-baseret dedup via DB unique partial indexes.
 * 2. autoCloseRespondedTasks(): luk eksisterende auto-tasks hvor tråden
 *    ikke længere kræver svar (Henrik har svaret manuelt eller via CRM).
 *
 * Kaldes fra cron /api/cron/unanswered-mails-check (hver 4. time).
 */

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import {
  getRequiresResponseEmailIds,
  getRequiresResponseStatus,
} from '@/lib/actions/email-response-status'

const AUTO_RULE = 'unanswered_email_24h'
const MIN_AGE_HOURS = 24

export interface AutoTaskRunResult {
  checked: number
  tasks_created: number
  tasks_auto_closed: number
  skipped_existing: number
  skipped_too_recent: number
  unassigned_count: number
  errors: string[]
  duration_ms: number
}

interface CandidateEmail {
  id: string
  conversation_id: string | null
  customer_id: string | null
  service_case_id: string | null
  received_at: string
}

/**
 * Vælg én admin-bruger som default assignee når service_case ikke har
 * assigned_to. Bruger den ÆLDSTE admin (deterministisk — samme bruger
 * hver kørsel). Hvis ingen findes: null.
 */
async function pickDefaultAssignee(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, created_at')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return (data?.id as string) || null
}

/**
 * Hent service_case.assigned_to hvis sat — første assignment-fallback.
 */
async function getServiceCaseAssignee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceCaseId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('service_cases')
    .select('assigned_to')
    .eq('id', serviceCaseId)
    .maybeSingle()

  return (data?.assigned_to as string) || null
}

/**
 * Bygg titel + priority baseret på alder i timer.
 */
function buildTaskMeta(ageHours: number): { title: string; priority: 'normal' | 'high' | 'urgent' } {
  const days = Math.floor(ageHours / 24)
  if (ageHours < 48) {
    return {
      title: 'Svar kunde — mail ubesvaret i 1 dag',
      priority: 'normal',
    }
  }
  if (ageHours < 24 * 7) {
    return {
      title: `Svar kunde — mail ubesvaret i ${days} dage`,
      priority: 'high',
    }
  }
  return {
    title: `HASTER: Svar kunde — mail ubesvaret i ${days} dage`,
    priority: 'urgent',
  }
}

/**
 * Hovedfunktion: opret auto-tasks for ubesvarede mails.
 * Conversation-grouped: én task pr. (auto_rule, conversation_id)
 * eller fallback (auto_rule, email_id) når conversation_id mangler.
 */
export async function createAutoTasksForUnansweredEmails(): Promise<AutoTaskRunResult> {
  const startedAt = Date.now()
  const result: AutoTaskRunResult = {
    checked: 0,
    tasks_created: 0,
    tasks_auto_closed: 0,
    skipped_existing: 0,
    skipped_too_recent: 0,
    unassigned_count: 0,
    errors: [],
    duration_ms: 0,
  }

  const supabase = await createClient()

  try {
    // 1. Step: hent IDs på linked+unanswered mails (ignorerede ekskluderet
    //    via to-lags-bælte i email-response-status helpers).
    const candidateIds = await getRequiresResponseEmailIds()
    result.checked = candidateIds.length
    if (candidateIds.length === 0) {
      result.duration_ms = Date.now() - startedAt
      return result
    }

    // 2. Hent mail-rows med metadata vi har brug for
    const { data: emailRows, error: fetchErr } = await supabase
      .from('incoming_emails')
      .select('id, conversation_id, customer_id, service_case_id, received_at')
      .in('id', candidateIds)

    if (fetchErr || !emailRows) {
      result.errors.push(`Failed to fetch emails: ${fetchErr?.message || 'unknown'}`)
      result.duration_ms = Date.now() - startedAt
      return result
    }

    const emails = (emailRows || []) as CandidateEmail[]

    // 3. Hent ageHours pr. email
    const statusMap = await getRequiresResponseStatus(candidateIds)

    // 4. Group by conversation_id (eller email.id hvis null).
    //    Vælg ÆLDSTE inbound i gruppen som source_email_id.
    type Group = {
      key: string
      conversationId: string | null
      sourceEmail: CandidateEmail
      ageHours: number
    }
    const groups = new Map<string, Group>()

    for (const email of emails) {
      // Skip mails der ikke har customer_id (skulle være filtreret af helper, men dobbelt-bælte)
      if (!email.customer_id) continue

      const status = statusMap[email.id]
      if (!status?.requiresResponse) continue
      const ageHours = status.ageHours ?? 0
      if (ageHours < MIN_AGE_HOURS) {
        result.skipped_too_recent++
        continue
      }

      const groupKey = email.conversation_id || `email:${email.id}`
      const existing = groups.get(groupKey)
      // Vælg ÆLDSTE inbound (ældste mail = først i tråden = mest relevant
      // som "source" for opfølgning).
      if (!existing || email.received_at < existing.sourceEmail.received_at) {
        groups.set(groupKey, {
          key: groupKey,
          conversationId: email.conversation_id,
          sourceEmail: email,
          ageHours,
        })
      }
    }

    if (groups.size === 0) {
      result.duration_ms = Date.now() - startedAt
      return result
    }

    // 5. Pre-fetch default assignee én gang
    const defaultAssignee = await pickDefaultAssignee(supabase)

    // 6. For hver gruppe: forsøg insert. Unique partial index sikrer dedup.
    for (const group of groups.values()) {
      try {
        const meta = buildTaskMeta(group.ageHours)

        // Assignment fallback: A → C → null
        let assignedTo: string | null = null
        if (group.sourceEmail.service_case_id) {
          assignedTo = await getServiceCaseAssignee(
            supabase,
            group.sourceEmail.service_case_id
          )
        }
        if (!assignedTo) {
          assignedTo = defaultAssignee
        }
        if (!assignedTo) {
          result.unassigned_count++
        }

        const nowIso = new Date().toISOString()

        const { error } = await supabase.from('customer_tasks').insert({
          customer_id: group.sourceEmail.customer_id,
          service_case_id: group.sourceEmail.service_case_id || null,
          source_email_id: group.sourceEmail.id,
          source_conversation_id: group.conversationId,
          auto_generated: true,
          auto_rule: AUTO_RULE,
          title: meta.title,
          description: null,
          status: 'pending',
          priority: meta.priority,
          assigned_to: assignedTo,
          due_date: nowIso,
          reminder_at: nowIso,
          created_by: null,
        })

        if (error) {
          // Unique-violation = en åben auto-task findes allerede for denne
          // conversation/mail. Det er forventet ved hver kørsel — tæl som
          // skipped_existing og fortsæt.
          const code = (error as { code?: string }).code
          if (code === '23505') {
            result.skipped_existing++
          } else {
            result.errors.push(
              `Insert failed for ${group.key}: ${error.message}`
            )
            logger.warn('createAutoTasksForUnansweredEmails: insert failed', {
              metadata: { groupKey: group.key, error: error.message },
            })
          }
        } else {
          result.tasks_created++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown'
        result.errors.push(`Group ${group.key}: ${msg}`)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    result.errors.push(`Top-level error: ${msg}`)
    logger.error('createAutoTasksForUnansweredEmails failed', { error: err })
  }

  result.duration_ms = Date.now() - startedAt
  return result
}

/**
 * Auto-close: find åbne auto-tasks hvor tråden IKKE længere kræver svar
 * (fx fordi Henrik har svaret manuelt eller mailen er blevet linket
 * til en anden status). Marker som done.
 */
export async function autoCloseRespondedTasks(): Promise<number> {
  const supabase = await createClient()

  try {
    // Hent alle åbne auto-tasks
    const { data: openTasks, error } = await supabase
      .from('customer_tasks')
      .select('id, source_email_id, source_conversation_id')
      .eq('auto_generated', true)
      .eq('auto_rule', AUTO_RULE)
      .neq('status', 'done')
      .limit(500)

    if (error || !openTasks || openTasks.length === 0) return 0

    // Saml IDs for alle åbne tasks' source_email_id
    const sourceIds = openTasks
      .map((t) => t.source_email_id as string | null)
      .filter((id): id is string => !!id)

    if (sourceIds.length === 0) return 0

    // Tjek om hver source_email_id stadig kræver svar
    const statusMap = await getRequiresResponseStatus(sourceIds)

    // Find tasks hvor source IKKE længere kræver svar
    const taskIdsToClose: string[] = []
    for (const task of openTasks) {
      const sid = task.source_email_id as string | null
      if (!sid) continue
      const status = statusMap[sid]
      // Hvis status mangler eller requiresResponse=false → luk
      if (!status || !status.requiresResponse) {
        taskIdsToClose.push(task.id as string)
      }
    }

    if (taskIdsToClose.length === 0) return 0

    const { error: updateErr } = await supabase
      .from('customer_tasks')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', taskIdsToClose)

    if (updateErr) {
      logger.warn('autoCloseRespondedTasks: update failed', {
        error: updateErr,
      })
      return 0
    }

    return taskIdsToClose.length
  } catch (err) {
    logger.error('autoCloseRespondedTasks failed', { error: err })
    return 0
  }
}

/**
 * Hent åbne auto-tasks for et bestemt source_email_id eller
 * source_conversation_id (til UI banner i MailDetail).
 */
export async function getOpenAutoTasksForEmail(
  emailId: string,
  conversationId: string | null
): Promise<Array<{ id: string; title: string; priority: string; created_at: string }>> {
  const supabase = await createClient()

  // Hvis conversation_id findes: prefer match på det. Ellers email_id.
  let query = supabase
    .from('customer_tasks')
    .select('id, title, priority, created_at')
    .eq('auto_generated', true)
    .neq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(5)

  if (conversationId) {
    query = query.eq('source_conversation_id', conversationId)
  } else {
    query = query.eq('source_email_id', emailId)
  }

  const { data, error } = await query

  if (error) {
    logger.warn('getOpenAutoTasksForEmail failed', {
      error,
      entityId: emailId,
    })
    return []
  }

  return (data || []) as Array<{
    id: string
    title: string
    priority: string
    created_at: string
  }>
}
