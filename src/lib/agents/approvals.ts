/**
 * Agent Core — approval-algoritme (app-side spejl af DB-triggeren).
 *
 * DB'en er source of truth: triggeren agent_enforce_approval_before_execute
 * + funktionen agent_action_is_executable haandhaever det samme. Denne modul
 * bruges til app-side pre-checks (fx vise "klar til udfoerelse" i UI, eller
 * lade Executor fejle tidligt med en venlig besked) — den ERSTATTER ikke
 * DB-garantien.
 *
 * Regler (identiske med SQL):
 *  - Reducér til seneste beslutning pr. distinkt approver (decided_by).
 *  - approved_count = distinkte approvers hvis seneste = 'approved' OG
 *    ikke udloebet (expires_at null eller i fremtiden).
 *  - rejected_exists = mindst én distinkt approver hvis seneste = 'rejected'.
 *  - Udfoerbar ⇔ approved_count >= max(min,1) OG NOT rejected_exists.
 *  - 'escalated' taeller hverken op eller blokerer.
 */

import type { AgentActionApproval } from '@/types/agent-core.types'

export interface EffectiveApprovals {
  approvedCount: number
  rejectedExists: boolean
}

/**
 * Seneste beslutning pr. distinkt approver, derefter aggregeret.
 * @param approvals alle approval-events for én action
 * @param now referencetidspunkt (default: nu)
 */
export function computeEffectiveApprovals(
  approvals: AgentActionApproval[],
  now: Date = new Date(),
): EffectiveApprovals {
  // Nyeste foerst; stabil tie-break paa id for determinisme (som SQL: id DESC).
  const sorted = [...approvals].sort((a, b) => {
    const t = new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime()
    if (t !== 0) return t
    return b.id.localeCompare(a.id)
  })

  const latestByApprover = new Map<string, AgentActionApproval>()
  for (const a of sorted) {
    if (!latestByApprover.has(a.decided_by)) {
      latestByApprover.set(a.decided_by, a)
    }
  }

  let approvedCount = 0
  let rejectedExists = false
  for (const a of latestByApprover.values()) {
    if (a.decision === 'rejected') {
      rejectedExists = true
    } else if (a.decision === 'approved') {
      const notExpired = !a.expires_at || new Date(a.expires_at).getTime() > now.getTime()
      if (notExpired) approvedCount++
    }
    // 'escalated' -> ingen effekt
  }

  return { approvedCount, rejectedExists }
}

/**
 * Er en action udfoerbar NU givet dens approvals og min_approvals?
 * Spejler public.agent_action_is_executable(action, min).
 */
export function isActionExecutable(
  approvals: AgentActionApproval[],
  minApprovals: number,
  now: Date = new Date(),
): boolean {
  const min = Math.max(minApprovals, 1)
  const { approvedCount, rejectedExists } = computeEffectiveApprovals(approvals, now)
  return approvedCount >= min && !rejectedExists
}
