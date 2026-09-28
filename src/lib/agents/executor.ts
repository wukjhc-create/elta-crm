/**
 * Agent Core — Executor.
 *
 * Den ENESTE vej fra en agent_action til en reel side-effekt. Rækkefølge
 * (alle trin fail-safe; en afvisning udfoerer ALDRIG en delvis effekt):
 *   1. Load action + run + config.
 *   2. Idempotens: allerede 'executed' -> no-op.
 *   3. Agent enabled? (ellers afvis)
 *   4. Slaa capability op (ingen handler -> afvis); capabilityen skal tilhoere runnets agent, og action-
 *      raekkens side_effect_class skal matche registeret (ellers afvis — raekken kan ikke loesne gating).
 *   5. Bestem requiresApproval (hard-block ELLER config ELLER capability ELLER action-flag).
 *   6. Hvis approval kraeves: verificér gyldige approvals NU (isActionExecutable).
 *      Hard-blocked klasser gaar ALTID gennem dette (defense-in-depth oven
 *      paa DB-triggeren).
 *   7. Budget (FAIL-CLOSED).
 *   8. "Claim" action (status -> executing, kun hvis uaendret), genverificér approvals, og kald handler.
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

  // 4. Capability FOER gating (P2 #11): registeret er sandheden om klasse, ejer og approval-krav — action-raekkens
  //    egne felter maa kun skaerpe, aldrig loesne. Ukendt/uwired capability afvises fail-safe.
  const cap = getCapability(act.capability)
  if (!cap) {
    return refuse(admin, theRun, act, `ukendt capability: ${act.capability}`)
  }
  if (!cap.handler) {
    return refuse(admin, theRun, act, `capability uden handler (endnu ikke wired): ${act.capability}`)
  }
  if (!cap.agentTypes.includes(theRun.agent_type)) {
    return refuse(admin, theRun, act, `capability ${act.capability} tilhoerer ikke agenten '${theRun.agent_type}'`)
  }
  if (cap.sideEffectClass !== act.side_effect_class) {
    return refuse(admin, theRun, act,
      `klasse-mismatch: action siger '${act.side_effect_class}', capability er '${cap.sideEffectClass}' (fail-closed)`)
  }

  // 5. requiresApproval (hard-block ELLER config ELLER capability ELLER action-flag)
  const hardBlocked = isHardBlocked(cap.sideEffectClass)
  const requiresApproval =
    hardBlocked ||
    cfg.requires_approval_for.includes(cap.sideEffectClass) ||
    cap.defaultRequiresApproval ||
    act.requires_approval
  const minApprovals = Math.max(act.min_approvals, cap.minApprovals)

  // 6. Approval-tjek (hard-blocked gaar ALTID gennem)
  if (requiresApproval) {
    const verdict = await approvalsSatisfied(admin, act.id, minApprovals)
    if (verdict === 'unreadable') {
      // Fail-closed: kan ikke verificere approvals -> udfoer ikke.
      return refuse(admin, theRun, act, 'kunne ikke laese approvals (fail-closed)')
    }
    if (verdict === 'missing') {
      return refuse(
        admin,
        theRun,
        act,
        `mangler gyldig(e) approval(s) (kraever ${minApprovals}, hard_blocked=${hardBlocked})`,
      )
    }
  }

  // 7. Budget (fail-closed)
  const budget = await checkAgentBudget(admin, cfg, theRun.id, theRun.agent_type)
  if (!budget.ok) {
    return refuse(admin, theRun, act, `budget: ${budget.reason ?? 'afvist'}`)
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

  // 8b. Genverificér approvals EFTER claim (P2 #11): lukker vinduet hvor en afvisning lander mellem trin 6 og
  //     claim. Ugyldig -> frigiv claim (tilbage til forrige status) og afvis; intet er udfoert.
  if (requiresApproval && (await approvalsSatisfied(admin, act.id, minApprovals)) !== 'ok') {
    await admin
      .from('agent_actions')
      .update({ status: act.status, updated_at: new Date().toISOString() })
      .eq('id', act.id)
      .eq('status', 'executing')
    return refuse(admin, theRun, act, 'approval ikke laengere gyldig ved udfoerelse (afvist undervejs)')
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
    await markFailed(admin, act.id, result.error ?? 'handler fejlede', result.data)
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

async function approvalsSatisfied(
   
  admin: any,
  actionId: string,
  minApprovals: number,
): Promise<'ok' | 'missing' | 'unreadable'> {
  const { data, error } = await admin.from('agent_action_approvals').select('*').eq('action_id', actionId)
  if (error) return 'unreadable'
  return isActionExecutable((data ?? []) as AgentActionApproval[], minApprovals) ? 'ok' : 'missing'
}

async function markFailed(
   
  admin: any,
  actionId: string,
  error: string,
  result?: Record<string, unknown>,
): Promise<void> {
  const patch: Record<string, unknown> = { status: 'failed', error, updated_at: new Date().toISOString() }
  if (result) patch.result = result
  await admin.from('agent_actions').update(patch).eq('id', actionId)
}

async function refuse(
   
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
