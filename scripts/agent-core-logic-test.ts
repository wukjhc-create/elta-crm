/**
 * Ren-logik-test af Agent Core sikkerhedsalgoritmer (ingen DB, ingen prod).
 * Koeres med: npx tsx scripts/agent-core-logic-test.ts
 *
 * Verificerer at TS-spejlet af DB-approval-reglerne opfoerer sig som
 * designet: udloeb, nyere rejection, distinkt approver, dual approval,
 * samt hard-block-klassifikationen.
 */
import { computeEffectiveApprovals, isActionExecutable } from '../src/lib/agents/approvals'
import { isHardBlocked, HARD_BLOCKED_CLASSES } from '../src/types/agent-core.types'
import type { AgentActionApproval, SideEffectClass } from '../src/types/agent-core.types'

let failures = 0
function assert(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)
  if (!cond) failures++
}

function appr(p: Partial<AgentActionApproval> & { decided_by: string; decision: AgentActionApproval['decision']; decided_at: string }): AgentActionApproval {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    action_id: 'a1',
    reason: null,
    channel: 'ui',
    expires_at: p.expires_at ?? null,
    ...p,
  } as AgentActionApproval
}

const now = new Date('2026-09-14T12:00:00Z')
const past = '2026-09-14T11:00:00Z'
const future = '2026-09-14T13:00:00Z'
const expired = '2026-09-14T11:59:00Z'

// 1. Ingen approvals -> ikke udfoerbar
assert(!isActionExecutable([], 1, now), 'ingen approvals => ikke udfoerbar')

// 2. Én gyldig approval, min=1 -> udfoerbar
assert(isActionExecutable([appr({ decided_by: 'u1', decision: 'approved', decided_at: past })], 1, now),
  'én gyldig approval, min=1 => udfoerbar')

// 3. Udloebet approval taeller ikke
assert(!isActionExecutable([appr({ decided_by: 'u1', decision: 'approved', decided_at: past, expires_at: expired })], 1, now),
  'udloebet approval => ikke udfoerbar')

// 4. Fremtidig expiry er gyldig
assert(isActionExecutable([appr({ decided_by: 'u1', decision: 'approved', decided_at: past, expires_at: future })], 1, now),
  'approval med fremtidig expiry => udfoerbar')

// 5. Nyere rejection fra samme bruger blokerer
assert(!isActionExecutable([
  appr({ decided_by: 'u1', decision: 'approved', decided_at: '2026-09-14T10:00:00Z' }),
  appr({ decided_by: 'u1', decision: 'rejected', decided_at: '2026-09-14T11:00:00Z' }),
], 1, now), 'nyere rejection (samme bruger) => blokerer')

// 6. Nyere approval efter rejection genaktiverer
assert(isActionExecutable([
  appr({ decided_by: 'u1', decision: 'rejected', decided_at: '2026-09-14T10:00:00Z' }),
  appr({ decided_by: 'u1', decision: 'approved', decided_at: '2026-09-14T11:00:00Z' }),
], 1, now), 'approve efter reject (samme bruger) => udfoerbar')

// 7. Samme bruger to gange taeller kun én (dual approval kraever 2 distinkte)
assert(!isActionExecutable([
  appr({ decided_by: 'u1', decision: 'approved', decided_at: past }),
  appr({ decided_by: 'u1', decision: 'approved', decided_at: past }),
], 2, now), 'samme bruger 2x, min=2 => IKKE nok (distinkt)')

// 8. To distinkte approvers, min=2 -> udfoerbar (dual approval)
assert(isActionExecutable([
  appr({ decided_by: 'u1', decision: 'approved', decided_at: past }),
  appr({ decided_by: 'u2', decision: 'approved', decided_at: past }),
], 2, now), 'to distinkte approvers, min=2 => udfoerbar')

// 9. To approvers men én rejecter senere -> blokeret
assert(!isActionExecutable([
  appr({ decided_by: 'u1', decision: 'approved', decided_at: past }),
  appr({ decided_by: 'u2', decision: 'approved', decided_at: past }),
  appr({ decided_by: 'u1', decision: 'rejected', decided_at: future }),
], 2, now), 'dual approval men senere rejection => blokeret')

// 10. escalated taeller hverken op eller blokerer
const eff = computeEffectiveApprovals([
  appr({ decided_by: 'u1', decision: 'escalated', decided_at: past }),
], now)
assert(eff.approvedCount === 0 && !eff.rejectedExists, 'escalated => hverken approve eller reject')

// 11. Hard-block-klassifikation
const hb: SideEffectClass[] = ['send_external', 'push_external', 'finance', 'delete']
assert(hb.every(isHardBlocked), 'alle 4 hard-blocked klasser genkendes')
const soft: SideEffectClass[] = ['read', 'create', 'update']
assert(soft.every((c) => !isHardBlocked(c)), 'read/create/update er ikke hard-blocked')
assert(HARD_BLOCKED_CLASSES.length === 4, 'praecis 4 hard-blocked klasser')

console.log(`\n${failures === 0 ? '✅ ALLE TESTS PASS' : `❌ ${failures} FEJL`}`)
process.exit(failures === 0 ? 0 : 1)
