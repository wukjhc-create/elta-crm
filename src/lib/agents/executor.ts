/**
 * Agent Core — Executor.
 *
 * Den ENESTE vej fra en agent_action til en reel side-effekt. Rækkefølge
 * (alle trin fail-safe; en afvisning udfoerer ALDRIG en delvis effekt):
 *   1. Load action + run + config.
 *   2. Idempotens: allerede 'executed' -> no-op.
 *   3. Agent enabled? (ellers afvis)
 *   4. Bestem requiresApproval (hard-block ELLER config ELLER action-flag).
 *   5. Hvis approval kraeves: verificér gyldige approvals NU (isActionExecutable).
 *      Hard-blocked klasser gaar ALTID gennem dette (defense-in-depth oven
 *      paa DB-triggeren).
 *   6. Budget (FAIL-CLOSED).
 *   7. Slaa capability op; ingen handler -> afvis (fail-safe).
 *   8. "Claim" action (status -> executing, kun hvis uaendret) og kald handler.
 *   9. Skriv resultat + audit-log (100%).
 *
 * Agenten kalder ALDRIG raa mutatorer — kun capability-handlere via denne fil.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import type {
  AgentAction,
  AgentActionApproval,
  AgentConfig,
  AgentRun,
} from '@/types/agent-core.types'
import { isHardBlocked } from '@/types/agent-core.types'
import { getCapability } from '@/lib/agents/capability-registry'
import { isActionExecutable } from '@/lib/agents/approvals'
import { checkAgentBudget } from '@/lib/agents/budget'
import { logAgentAudit } from '@/lib/agents/audit'

export interface ExecuteOutcome {
  status: 'executed' | 'refused' | 'failed' | 'noop' | 'needs_verification'
  reason?: string
}

export async function executeAction(actionId: string): Promise<ActionResult<ExecuteOutcome>> {
  const admin = createAdminClient()

  // 1. Load action
  const { data: action, error: aErr } = await admin
    .from('agent_actions')
    .select('*')
    .eq('id', actionId)
    .maybeSingle()
  if (aErr || !action) {
    return { success: false, error: 'Action ikke fundet' }
  }
  const act = action as AgentAction

  // 2. Idempotens
  if (act.status === 'executed') {
    return { success: true, data: { status: 'noop', reason: 'allerede executed' } }
  }
  if (['rejected', 'rolled_back', 'failed'].includes(act.status)) {
    return { success: true, data: { status: 'noop', reason: `terminal status: ${act.status}` } }
  }

  // Load run + config
  const { data: run } = await admin
    .from('agent_runs')
    .select('*')
    .eq('id', act.run_id)
    .maybeSingle()
  if (!run) return { success: false, error: 'Run ikke fundet' }
  const theRun = run as AgentRun

  const { data: config } = await admin
    .from('agent_configs')
    .select('*')
    .eq('agent_type', theRun.agent_type)
    .maybeSingle()
  if (!config) {
    return refuse(admin, theRun, act, 'ingen agent_config')
  }
  const cfg = config as AgentConfig

  // 3. Agent enabled?
  if (!cfg.enabled) {
    return refuse(admin, theRun, act, 'agent disabled')
  }

  // 4. requiresApproval
  const hardBlocked = isHardBlocked(act.side_effect_class)
  const requiresApproval =
    hardBlocked ||
    cfg.requires_approval_for.includes(act.side_effect_class) ||
    act.requires_approval

  // 5. Approval-tjek (hard-blocked gaar ALTID gennem)
  if (requiresApproval) {
    const { data: approvals, error: apErr } = await admin
      .from('agent_action_approvals')
      .select('*')
      .eq('action_id', act.id)
    if (apErr) {
      // Fail-closed: kan ikke verificere approvals -> udfoer ikke.
      return refuse(admin, theRun, act, 'kunne ikke laese approvals (fail-closed)')
    }
    const ok = isActionExecutable((approvals ?? []) as AgentActionApproval[], act.min_approvals)
    if (!ok) {
      return refuse(
        admin,
        theRun,
        act,
        `mangler gyldig(e) approval(s) (kraever ${act.min_approvals}, hard_blocked=${hardBlocked})`,
      )
    }
  }

  // 6. Budget (fail-closed)
  const budget = await checkAgentBudget(admin, cfg, theRun.id, theRun.agent_type)
  if (!budget.ok) {
    return refuse(admin, theRun, act, `budget: ${budget.reason ?? 'afvist'}`)
  }

  // 7. Capability + handler
  const cap = getCapability(act.capability)
  if (!cap) {
    return refuse(admin, theRun, act, `ukendt capability: ${act.capability}`)
  }
  if (!cap.handler) {
    return refuse(admin, theRun, act, `capability uden handler (endnu ikke wired): ${act.capability}`)
  }

  // 8. Claim: status -> executing, kun hvis stadig i den forventede tilstand.
  const claim = await admin
    .from('agent_actions')
    .update({ status: 'executing', updated_at: new Date().toISOString() })
    .eq('id', act.id)
    .in('status', ['planned', 'awaiting_approval', 'approved'])
    .select('id')
  if (claim.error || !claim.data || claim.data.length === 0) {
    // En anden proces har allerede taget den, eller status er terminal.
    return { success: true, data: { status: 'noop', reason: 'kunne ikke claime (race/terminal)' } }
  }

  // 9. Udfoer handler
  try {
    const result = await cap.handler({ action: act, run: theRun, admin })
    if (result.ok) {
      await admin
        .from('agent_actions')
        .update({
          status: 'executed',
          result: result.data ?? {},
          executed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', act.id)
      await logAgentAudit({
        admin,
        agentType: theRun.agent_type,
        runId: theRun.id,
        actionId: act.id,
        action: 'executed',
        description: `${act.capability} (${act.side_effect_class})`,
        metadata: { capability: act.capability, side_effect_class: act.side_effect_class, result: result.data ?? {} },
      })
      return { success: true, data: { status: 'executed' } }
    }

    // Uvist transport-resultat: markér til menneskelig kontrol, retry ALDRIG.
    if (result.uncertain) {
      await admin
        .from('agent_actions')
        .update({
          status: 'needs_verification',
          error: result.error ?? 'uvist transport-resultat',
          result: result.data ?? {},
          updated_at: new Date().toISOString(),
        })
        .eq('id', act.id)
      await logAgentAudit({
        admin,
        agentType: theRun.agent_type,
        runId: theRun.id,
        actionId: act.id,
        action: 'needs_verification',
        description: result.error ?? 'uvist transport-resultat — kraever manuel kontrol',
        metadata: { capability: act.capability, side_effect_class: act.side_effect_class },
      })
      return { success: false, error: result.error ?? 'uvist resultat', data: { status: 'needs_verification' } }
    }

    // Handler returnerede definitiv fejl (intet sendt)
    await markFailed(admin, act.id, result.error ?? 'handler fejlede')
    await logAgentAudit({
      admin,
      agentType: theRun.agent_type,
      runId: theRun.id,
      actionId: act.id,
      action: 'failed',
      description: result.error ?? 'handler fejlede',
    })
    return { success: false, error: result.error ?? 'handler fejlede', data: { status: 'failed' } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ukendt fejl'
    await markFailed(admin, act.id, msg)
    await logAgentAudit({
      admin,
      agentType: theRun.agent_type,
      runId: theRun.id,
      actionId: act.id,
      action: 'failed',
      description: msg,
    })
    logger.error('executeAction handler-exception', { error: err, metadata: { actionId: act.id } })
    return { success: false, error: msg, data: { status: 'failed' } }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markFailed(admin: any, actionId: string, error: string): Promise<void> {
  await admin
    .from('agent_actions')
    .update({ status: 'failed', error, updated_at: new Date().toISOString() })
    .eq('id', actionId)
}

async function refuse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  run: AgentRun,
  act: AgentAction,
  reason: string,
): Promise<ActionResult<ExecuteOutcome>> {
  // En afvisning aendrer IKKE action-status (den forbliver til senere approval/retry),
  // men logges altid til audit.
  await logAgentAudit({
    admin,
    agentType: run.agent_type,
    runId: run.id,
    actionId: act.id,
    action: 'refused',
    description: reason,
    metadata: { capability: act.capability, side_effect_class: act.side_effect_class },
  })
  logger.warn('Agent Core: action afvist', { metadata: { actionId: act.id, reason } })
  return { success: false, error: `Afvist: ${reason}`, data: { status: 'refused', reason } }
}
