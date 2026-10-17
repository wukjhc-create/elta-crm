/**
 * Agent Core — budget-guard (FAIL-CLOSED).
 *
 * Modsat det eksisterende ai-budget.ts (som fejler AABENT for ikke at
 * blokere mail-processing) fejler agent-budgettet LUKKET: hvis et tjek ikke
 * kan gennemfoeres, naegtes udfoerelse. En autonom agent maa hellere stoppe
 * end loebe loebsk.
 *
 * Tre lofter (fra agent_configs):
 *  - max_actions_per_run   : eksekverede actions i denne run
 *  - daily_action_budget   : eksekverede actions i dag (pr. agent_type)
 *  - daily_token_budget    : tokens brugt i dag (pr. agent_type)
 */

import type { AgentConfig, AgentType } from '@/types/agent-core.types'
import { logger } from '@/lib/utils/logger'
import { copenhagenParts, copenhagenLocalToIso } from '@/lib/utils/copenhagen-time'

export interface BudgetResult {
  ok: boolean
  reason?: string
}

// AU-4 (automations-review 2026-10-17): dagen er den danske kalenderdag (før UTC-midnat = 01/02 dansk tid)
function copenhagenDayStartISO(now: Date = new Date()): string {
  return copenhagenLocalToIso(copenhagenParts(now).date, '00:00')
}

/**
 * Tjek at der er budget til at udfoere én action mere i denne run.
 * FAIL-CLOSED: enhver fejl -> { ok: false }.
 */
export async function checkAgentBudget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  config: AgentConfig,
  runId: string,
  agentType: AgentType,
): Promise<BudgetResult> {
  try {
    if (!config.enabled) {
      return { ok: false, reason: 'agent disabled' }
    }

    const dayStart = copenhagenDayStartISO()

    // 1) Per-run action cap
    const perRun = await admin
      .from('agent_actions')
      .select('id', { count: 'exact', head: true })
      .eq('run_id', runId)
      .eq('status', 'executed')
    if (perRun.error) return { ok: false, reason: 'per-run count fejlede (fail-closed)' }
    if ((perRun.count ?? 0) >= config.max_actions_per_run) {
      return { ok: false, reason: `max_actions_per_run (${config.max_actions_per_run}) naaet` }
    }

    // 2) Daily action budget (pr. agent_type) — AU-4: actions UDFØRT i dag (executed_at), uanset hvornår run'et blev
    //    oprettet. Før talte kun actions fra runs oprettet i dag → godkendte gårsdagens forslag i dag talte 0.
    const dailyActions = await admin
      .from('agent_actions')
      .select('id, run:agent_runs!inner(agent_type)', { count: 'exact', head: true })
      .eq('run.agent_type', agentType)
      .eq('status', 'executed')
      .gte('executed_at', dayStart)
    if (dailyActions.error) return { ok: false, reason: 'daglig action-count fejlede (fail-closed)' }
    if ((dailyActions.count ?? 0) >= config.daily_action_budget) {
      return { ok: false, reason: `daily_action_budget (${config.daily_action_budget}) naaet` }
    }

    {

      // 3) Daily token budget (pr. agent_type)
      const tokenRows = await admin
        .from('agent_runs')
        .select('tokens_used')
        .eq('agent_type', agentType)
        .gte('created_at', dayStart)
      if (tokenRows.error) return { ok: false, reason: 'daglig token-sum fejlede (fail-closed)' }
      const tokensUsed = (tokenRows.data ?? []).reduce(
        (sum: number, r: { tokens_used: number | null }) => sum + (r.tokens_used ?? 0),
        0,
      )
      if (tokensUsed >= config.daily_token_budget) {
        return { ok: false, reason: `daily_token_budget (${config.daily_token_budget}) naaet` }
      }
    }

    return { ok: true }
  } catch (err) {
    logger.error('checkAgentBudget exception (fail-closed)', { error: err })
    return { ok: false, reason: 'budget-tjek exception (fail-closed)' }
  }
}
