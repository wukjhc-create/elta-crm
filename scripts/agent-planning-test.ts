/**
 * Unit-test af planlaegningsagentens rene logik (ingen DB).
 *   npx tsx scripts/agent-planning-test.ts
 */
import {
  nextWorkingDays, suggestSlot, planningBlocker, buildPlanningProposal, isFieldTechnician, copenhagenToday,
  type Technician, type WorkloadEntry, type PlanningCase,
} from '../src/lib/agents/planning-agent'
import { getCapability } from '../src/lib/agents/capability-registry'

let fails = 0
const assert = (cond: boolean, label: string, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!cond) fails++ }

const T = (id: string, name: string, role = 'montør', extra: Partial<Technician> = {}): Technician => ({ id, name, role, active: true, termination_date: null, ...extra })
const W = (emp: string, date: string, status = 'planned'): WorkloadEntry => ({ assigned_employee_id: emp, scheduled_date: date, status })
const C = (extra: Partial<PlanningCase> = {}): PlanningCase => ({ id: 'c1', case_number: 'S-1', title: 'Tavleskift', status: 'new', customer_id: 'k1', is_proposal: false, ...extra })

// Fredag 2026-10-02 -> naeste hverdage springer weekenden over
const fri = '2026-10-02'
const days = nextWorkingDays(fri, 3)
assert(JSON.stringify(days) === JSON.stringify(['2026-10-05', '2026-10-06', '2026-10-07']), 'hverdage efter fredag = man/tir/ons', days.join(','))
assert(nextWorkingDays('2026-10-05', 1)[0] === '2026-10-06', 'aldrig i dag — foerste hverdag er i morgen')
assert(/^\d{4}-\d{2}-\d{2}$/.test(copenhagenToday()), 'copenhagenToday giver YYYY-MM-DD')
assert(copenhagenToday(new Date('2026-10-04T22:30:00Z')) === '2026-10-05', 'København-dato (UTC 22:30 = næste dag lokalt)')

// Montoer-filter
assert(!isFieldTechnician(T('x', 'X', 'kontor'), fri), 'kontor planlaegges ikke')
assert(!isFieldTechnician(T('x', 'X', 'lærling'), fri), 'laerling planlaegges ikke alene')
assert(!isFieldTechnician(T('x', 'X', 'montør', { active: false }), fri), 'inaktiv planlaegges ikke')
assert(!isFieldTechnician(T('x', 'X', 'montør', { termination_date: '2026-10-01' }), fri), 'fratraadt planlaegges ikke')
assert(isFieldTechnician(T('x', 'X', 'elektriker'), fri), 'elektriker kan planlaegges')

// Laveste belastning vinder
{
  const s = suggestSlot([T('a', 'Anders'), T('b', 'Bo')], [W('a', '2026-10-05'), W('a', '2026-10-06')], fri)
  assert(s?.employee_id === 'b' && s.scheduled_date === '2026-10-05' && s.load_in_horizon === 0, 'mindst belastede montoer + foerste hverdag', JSON.stringify(s))
}
// Uafgjort -> alfabetisk (deterministisk)
{
  const s = suggestSlot([T('b', 'Bo'), T('a', 'Anders')], [], fri)
  assert(s?.employee_id === 'a', 'uafgjort -> alfabetisk navn')
}
// maxPerDay: fyldt dag springes over
{
  const s = suggestSlot([T('a', 'Anders')], [W('a', '2026-10-05'), W('a', '2026-10-05')], fri, { maxPerDay: 2 })
  assert(s?.scheduled_date === '2026-10-06', 'fuld dag (2) springes over -> naeste hverdag', s?.scheduled_date)
}
// Afsluttede/aflyste ordrer taeller ikke
{
  const s = suggestSlot([T('a', 'Anders')], [W('a', '2026-10-05', 'done'), W('a', '2026-10-05', 'cancelled')], fri)
  assert(s?.scheduled_date === '2026-10-05' && s.load_in_horizon === 0, 'done/cancelled taeller ikke i belastning')
}
// Ingen plads i horisonten -> null
{
  const wl = nextWorkingDays(fri, 2).flatMap((d) => [W('a', d), W('a', d)])
  assert(suggestSlot([T('a', 'Anders')], wl, fri, { horizonWorkingDays: 2, maxPerDay: 2 }) === null, 'ingen ledig dag i horisonten -> null')
  assert(suggestSlot([T('k', 'Kontor', 'kontor')], [], fri) === null, 'ingen feltmontoerer -> null')
}

// Blockers
assert(planningBlocker(C(), 0) === null, 'bekraeftet sag uden arbejdsordre -> ok')
assert(!!planningBlocker(C({ customer_id: null }), 0), 'uden kunde -> blokeret')
assert(!!planningBlocker(C({ is_proposal: true }), 0), 'sagsforslag -> blokeret')
assert(!!planningBlocker(C({ status: 'closed' }), 0) && !!planningBlocker(C({ status: 'converted' }), 0), 'lukket/konverteret -> blokeret')
assert(/allerede en arbejdsordre/.test(planningBlocker(C(), 1) ?? ''), 'eksisterende (ikke-annulleret) arbejdsordre -> blokeret (X4: også udførte)')
{
  const slot = suggestSlot([T('a', 'Anders')], [], fri)
  const p = buildPlanningProposal(C(), 0, slot)
  assert(!!p && p.case_id === 'c1' && p.assigned_employee_id === 'a' && p.scheduled_date === '2026-10-05' && p.title === 'Arbejdsordre - Tavleskift', 'forslag bygges korrekt')
  assert(buildPlanningProposal(C(), 0, null) === null, 'intet forslag uden slot')
}

// Capability-kontrakt
const cap = getCapability('planning.propose_work_order')
assert(!!cap?.handler && cap.sideEffectClass === 'create' && cap.defaultRequiresApproval && cap.agentTypes.join() === 'planning',
  'capability: create, approval, ejer planning, handler wired')

console.log(`\n${fails === 0 ? '✅ ALLE PLANLAEGNINGS-TESTS PASS' : `❌ ${fails} FEJL`}`)
process.exit(fails === 0 ? 0 : 1)
