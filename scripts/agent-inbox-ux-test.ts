/**
 * Unit-test af Agent Inbox-praesentationsreglerne (P2 #14). Ingen DB.
 *   npx tsx scripts/agent-inbox-ux-test.ts
 */
import { actionControls, reviewerReason, CAPABILITY_LABELS, STATUS_LABELS, AGENT_LABELS, STUCK_EXECUTING_MS } from '../src/lib/agents/inbox-presentation'
import { listCapabilities } from '../src/lib/agents/capability-registry'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }
const A = (status: string, extra: Partial<{ side_effect_class: string; requires_approval: boolean; updated_at: string }> = {}) =>
  ({ status, side_effect_class: 'create', requires_approval: true, ...extra })

// Godkendelses-flow
{
  const c = actionControls(A('awaiting_approval'), true)
  assert(c.canApprove && c.canReject && !c.canExecute && /godkendelse/.test(c.executeHint ?? ''), 'afventer: Godkend/Afvis, Udfør slået fra med forklaring')
}
{
  const c = actionControls(A('approved'), true)
  assert(!c.canApprove && c.canReject && c.canExecute && !c.executeHint, 'godkendt: ingen ekstra Godkend; Afvis + Udfør mulig')
}
{
  const c = actionControls(A('approved'), false)
  assert(!c.canExecute && /slået fra/.test(c.executeHint ?? ''), 'agent slået fra: Udfør slået fra med forklaring')
}
{
  const c = actionControls(A('planned', { side_effect_class: 'read', requires_approval: false }), true)
  assert(!c.canApprove && !c.canReject && c.canExecute, 'udkast (read, fri): kun Udfør')
}
{
  const c = actionControls(A('planned', { side_effect_class: 'send_external', requires_approval: false }), true)
  assert(c.canApprove && !c.canExecute, 'hard-blocked kræver godkendelse selv hvis rækken siger nej')
}
for (const st of ['executed', 'rejected', 'failed', 'rolled_back']) {
  const c = actionControls(A(st), true)
  assert(!c.canApprove && !c.canReject && !c.canExecute && !c.warning, `${st}: ingen knapper`)
}
{
  const c = actionControls(A('needs_verification'), true)
  assert(!c.canExecute && /gentag den ikke/.test(c.warning ?? ''), 'needs_verification: advarsel, ingen knapper')
}
{
  const now = Date.now()
  const fresh = actionControls(A('executing', { updated_at: new Date(now - 60_000).toISOString() }), true, now)
  const stuck = actionControls(A('executing', { updated_at: new Date(now - STUCK_EXECUTING_MS - 1).toISOString() }), true, now)
  assert(!fresh.warning && !fresh.canExecute, 'executing (frisk): ingen advarsel, ingen knapper')
  assert(/gået i stå/.test(stuck.warning ?? '') && !stuck.canExecute, 'executing > 15 min: advarsel om manuel kontrol')
}

// Aarsager
assert(reviewerReason('Afvist: agent disabled') === 'Agenten er slået fra — intet er udført.', 'agent disabled -> dansk')
assert(/Mangler godkendelse/.test(reviewerReason('Afvist: mangler gyldig(e) approval(s) (kraever 1, hard_blocked=false)')), 'mangler approval -> dansk')
assert(/allerede udført/.test(reviewerReason('allerede executed')), 'allerede executed -> dansk')
assert(/afvist/.test(reviewerReason('terminal status: rejected')), 'terminal rejected -> dansk')
assert(/et andet sted/.test(reviewerReason('kunne ikke claime (race/terminal)')), 'claim-race -> dansk')
assert(/sikkerhedstjekket/.test(reviewerReason("Afvist: klasse-mismatch: action siger 'read', capability er 'create' (fail-closed)")), 'klasse-mismatch -> sikkerhedstjek')
assert(reviewerReason('forældet forslag: sagen har allerede en aktiv arbejdsordre') === 'Forslaget er forældet: sagen har allerede en aktiv arbejdsordre', 'stale -> "Forslaget er forældet: …"')
assert(reviewerReason('noget helt andet') === 'noget helt andet' && reviewerReason(null) === '', 'ukendt årsag uændret; null -> tom')

// Drift-vagter
const missingCap = listCapabilities().map((c) => c.key).filter((k) => !CAPABILITY_LABELS[k])
assert(missingCap.length === 0, 'alle registrerede capabilities har en dansk titel', missingCap.join(','))
const dbStatuses = ['planned', 'awaiting_approval', 'approved', 'rejected', 'executing', 'executed', 'failed', 'rolled_back', 'needs_verification'] // agent_actions_status_check
assert(dbStatuses.every((s) => STATUS_LABELS[s]), 'alle agent_actions-statusser har en dansk label')
assert(['mail', 'offer', 'followup', 'planning', 'purchase', 'economy', 'director'].every((t) => AGENT_LABELS[t]), 'alle 7 agenttyper har et navn')

console.log(`\n${fails === 0 ? '✅ ALLE INBOX-UX-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
