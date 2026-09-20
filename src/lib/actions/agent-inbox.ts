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
import { runMailAgent } from '@/lib/agents/mail-agent'
import { executeAction } from '@/lib/agents/executor'
import type { ActionResult } from '@/types/common.types'
import type { AgentInboxItem } from '@/types/agent-core.types'
import { reviewPriority, type ConfidenceLevel } from '@/lib/agents/mail-confidence'

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
