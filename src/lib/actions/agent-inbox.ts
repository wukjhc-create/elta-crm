'use server'

/**
 * Agent Inbox — server actions (Fase 3 MVP).
 *
 * Admin-only (matcher RLS). Godkendelser inds�ttes via den AUTHENTICATED
 * klient, saa RLS haandhaever decided_by = auth.uid() + admin — en
 * uautoriseret bruger kan aldrig fabrikere en approval. Faktisk udfoerelse
 * gaar altid gennem Executor (som selv gater budget/approval/hard-block).
 */

import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatError } from '@/lib/actions/action-helpers'
import { runMailAgent, findLinkCandidates } from '@/lib/agents/mail-agent'
import { executeAction } from '@/lib/agents/executor'
import { logAgentAudit } from '@/lib/agents/audit'
import type { ActionResult } from '@/types/common.types'
import type { AgentInboxItem } from '@/types/agent-core.types'
import { reviewPriority, validateCandidateSelection, type ConfidenceLevel } from '@/lib/agents/mail-confidence'

const TERMINAL_ACTION_STATUS = ['executed', 'rejected', 'failed', 'rolled_back']

async function requireAdmin() {
  const ctx = await getAuthenticatedClientWithRole()
  if (ctx.role !== 'admin') {
    throw new Error('Kun administratorer har adgang til Agent Inbox')
  }
  return ctx
}

/** Hent seneste agent-runs med deres actions (admin, via RLS). */
export async function getAgentInbox(limit = 25): Promise<ActionResult<AgentInboxItem[]>> {
  try {
    const { supabase } = await requireAdmin()

    const { data: runs, error: rErr } = await supabase
      .from('agent_runs')
      .select('id, agent_type, status, safety_mode, summary, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (rErr) return { success: false, error: 'Kunne ikke hente agent-runs' }

    const runIds = (runs ?? []).map((r: { id: string }) => r.id)
    const actionsByRun = new Map<string, AgentInboxItem['actions']>()
    if (runIds.length > 0) {
      const { data: actions } = await supabase
        .from('agent_actions')
        .select('id, run_id, capability, action_type, side_effect_class, status, requires_approval, min_approvals, payload, result')
        .in('run_id', runIds)
        .order('created_at', { ascending: true })
      for (const a of actions ?? []) {
        const arr = actionsByRun.get(a.run_id) ?? []
        arr.push(a as AgentInboxItem['actions'][number])
        actionsByRun.set(a.run_id, arr)
      }
    }

    const items: AgentInboxItem[] = (runs ?? []).map((run: AgentInboxItem['run']) => {
      const actions = actionsByRun.get(run.id) ?? []
      const nonTerminal = actions.filter((a) => !TERMINAL_ACTION_STATUS.includes(a.status))
      const topReviewPriority = nonTerminal.reduce((max, a) => {
        const p = reviewPriority((a.payload?.confidence_level as ConfidenceLevel) ?? 'high', !!a.payload?.conflicts)
        return Math.max(max, p)
      }, -1)
      return { run, actions, pendingCount: nonTerminal.length, topReviewPriority }
    })

    // Mail-kontekst: hent de mails forslagene refererer til (via RLS-klient).
    const emailIdOf = (it: AgentInboxItem): string | undefined =>
      it.actions.map((a) => a.payload?.email_id as string | undefined).find(Boolean)
    const emailIds = [...new Set(items.map(emailIdOf).filter(Boolean) as string[])]
    if (emailIds.length > 0) {
      const { data: mails } = await supabase
        .from('incoming_emails')
        .select('id, subject, sender_name, sender_email, received_at, body_preview, customer_id, customers ( company_name, customer_number )')
        .in('id', emailIds)
      const mailById = new Map<string, AgentInboxItem['mail']>()
      for (const m of mails ?? []) {
        const custRaw = (m as { customers?: unknown }).customers
        const cust = (Array.isArray(custRaw) ? custRaw[0] : custRaw) as { company_name?: string; customer_number?: string } | null
        mailById.set(m.id, {
          id: m.id,
          subject: m.subject,
          sender_name: m.sender_name ?? null,
          sender_email: m.sender_email,
          received_at: m.received_at ?? null,
          body_preview: m.body_preview ?? null,
          customer_id: m.customer_id ?? null,
          customer_name: cust?.company_name ?? null,
          customer_number: cust?.customer_number ?? null,
        })
      }
      for (const it of items) {
        const eid = emailIdOf(it)
        it.mail = eid ? mailById.get(eid) ?? null : null
      }
    }

    // Prioritér paa tvaers af runs: stoerst review-behov foerst, derefter nyeste.
    items.sort((a, b) => {
      if (b.topReviewPriority !== a.topReviewPriority) return b.topReviewPriority - a.topReviewPriority
      return new Date(b.run.created_at).getTime() - new Date(a.run.created_at).getTime()
    })
    return { success: true, data: items }
  } catch (err) {
    return { success: false, error: formatError(err, 'Der opstod en fejl') }
  }
}

/** Trig en manuel Mailagent-run mod en indgaaende mail (opretter forslag). */
export async function runMailAgentAction(emailId: string): Promise<ActionResult<{ runId: string; proposals: number }>> {
  try {
    const { userId } = await requireAdmin()
    const res = await runMailAgent(emailId, { triggeredBy: userId })
    if (res.success) revalidatePath('/dashboard/agents')
    return res
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke koere Mailagent') }
  }
}

/**
 * Vælg en kunde-kandidat for et link_customer-forslag med flere kandidater.
 * Tamper-resistant: customerId skal vaere blandt forslagets gemte kandidater.
 * Stale-resistant: friske kandidater skal matche de gemte, ellers kraev nyt review.
 * Skriver kun selected_customer_id paa actionen (linker IKKE — det sker via Executor
 * efter approval). Kun admin.
 */
export async function selectLinkCandidateAction(
  actionId: string,
  customerId: string,
): Promise<ActionResult<void>> {
  try {
    const { userId } = await requireAdmin()
    const admin = createAdminClient()

    const { data: action } = await admin
      .from('agent_actions')
      .select('id, run_id, capability, status, payload')
      .eq('id', actionId)
      .maybeSingle()
    if (!action) return { success: false, error: 'Action ikke fundet' }
    if (action.capability !== 'mail.link_customer') {
      return { success: false, error: 'Kandidat-valg gaelder kun link_customer' }
    }
    if (['executed', 'rejected', 'failed', 'rolled_back'].includes(action.status)) {
      return { success: false, error: `Action er allerede afsluttet (${action.status})` }
    }

    const payload = (action.payload ?? {}) as {
      email_id?: string
      candidates?: Array<{ id: string }>
    }
    const storedIds = (payload.candidates ?? []).map((c) => c.id)
    const emailId = payload.email_id
    if (!emailId) return { success: false, error: 'Forslag mangler email-reference' }

    // Frisk kandidat-udledning til stale-check.
    const { data: mail } = await admin
      .from('incoming_emails')
      .select('id, subject, sender_email, sender_name, body_text, body_preview, customer_id')
      .eq('id', emailId)
      .maybeSingle()
    if (!mail) return { success: false, error: 'Mail ikke fundet' }
    const fresh = await findLinkCandidates(admin, mail)
    const freshIds = fresh.map((c) => c.id)

    const v = validateCandidateSelection(storedIds, freshIds, customerId)
    if (!v.ok) return { success: false, error: v.reason }

    const { error: upErr } = await admin
      .from('agent_actions')
      .update({ payload: { ...payload, selected_customer_id: customerId }, updated_at: new Date().toISOString() })
      .eq('id', actionId)
    if (upErr) return { success: false, error: formatError(upErr, 'Kunne ikke gemme valg') }

    await logAgentAudit({
      admin,
      agentType: 'mail',
      runId: action.run_id,
      actionId,
      action: 'candidate_selected',
      description: `Reviewer valgte kunde ${customerId}`,
      metadata: { selected_customer_id: customerId, selected_by: userId },
    })

    revalidatePath('/dashboard/agents')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Der opstod en fejl') }
  }
}

/** Godkend en action. Approval inds�ttes via authenticated klient (RLS-haandhaevet). */
export async function approveAgentActionAction(
  actionId: string,
  reason?: string,
): Promise<ActionResult<void>> {
  try {
    const { supabase, userId } = await requireAdmin()

    const { error } = await supabase.from('agent_action_approvals').insert({
      action_id: actionId,
      decision: 'approved',
      decided_by: userId,
      reason: reason ?? null,
    })
    if (error) return { success: false, error: formatError(error, 'Kunne ikke godkende') }

    // Bedst-effort lifecycle-flip (ikke sikkerhedskritisk; Executor tjekker approvals).
    await createAdminClient()
      .from('agent_actions')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', actionId)
      .in('status', ['planned', 'awaiting_approval'])

    revalidatePath('/dashboard/agents')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Der opstod en fejl') }
  }
}

/** Afvis en action (immutable rejected-event; blokerer fremtidig udfoerelse). */
export async function rejectAgentActionAction(
  actionId: string,
  reason?: string,
): Promise<ActionResult<void>> {
  try {
    const { supabase, userId } = await requireAdmin()

    const { error } = await supabase.from('agent_action_approvals').insert({
      action_id: actionId,
      decision: 'rejected',
      decided_by: userId,
      reason: reason ?? null,
    })
    if (error) return { success: false, error: formatError(error, 'Kunne ikke afvise') }

    await createAdminClient()
      .from('agent_actions')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', actionId)
      .in('status', ['planned', 'awaiting_approval', 'approved'])

    revalidatePath('/dashboard/agents')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Der opstod en fejl') }
  }
}

/**
 * Gem et manuelt redigeret draft_reply-udkast paa forslaget (sendes IKKE).
 * Kun admin; kun draft_reply; ingen direkte DB-write fra UI (gaar via admin
 * efter permission-check). Udkastet gemmes i payload til senere (gated) brug.
 */
export async function saveDraftAction(actionId: string, draft: string): Promise<ActionResult<void>> {
  try {
    await requireAdmin()
    if (typeof draft !== 'string' || draft.length === 0 || draft.length > 20000) {
      return { success: false, error: 'Ugyldigt udkast (tomt eller for langt)' }
    }
    const admin = createAdminClient()
    const { data: action } = await admin
      .from('agent_actions')
      .select('id, capability, status, payload')
      .eq('id', actionId)
      .maybeSingle()
    if (!action) return { success: false, error: 'Action ikke fundet' }
    if (action.capability !== 'mail.draft_reply') {
      return { success: false, error: 'Kun draft_reply-udkast kan redigeres' }
    }
    if (['executed', 'rejected', 'failed', 'rolled_back'].includes(action.status)) {
      return { success: false, error: `Action er afsluttet (${action.status})` }
    }
    const payload = (action.payload ?? {}) as Record<string, unknown>
    const { error } = await admin
      .from('agent_actions')
      .update({ payload: { ...payload, draft, draft_edited: true }, updated_at: new Date().toISOString() })
      .eq('id', actionId)
    if (error) return { success: false, error: formatError(error, 'Kunne ikke gemme udkast') }
    revalidatePath('/dashboard/agents')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Der opstod en fejl') }
  }
}

/** Udfoer en action gennem Executor (som selv gater alt). */
export async function executeAgentActionAction(actionId: string): Promise<ActionResult<{ status: string }>> {
  try {
    await requireAdmin()
    const res = await executeAction(actionId)
    revalidatePath('/dashboard/agents')
    if (!res.success) return { success: false, error: res.error }
    return { success: true, data: { status: res.data?.status ?? 'unknown' } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke udfoere action') }
  }
}
