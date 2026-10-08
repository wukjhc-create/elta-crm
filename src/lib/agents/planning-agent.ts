/**
 * Agent Core — Planlaegningsagent (Fase 6, forberedelse; P2 #13).
 *
 * Capability `planning.propose_work_order` (class `create`, approval paakraevet, ejer 'planning'):
 *   For en bekraeftet sag UDEN aktiv arbejdsordre foreslaas en dato + montoer ud fra aktuel belastning.
 *   Efter approval (og KUN hvis agenten er enabled) opretter Executor en intern arbejdsordre (status 'planned').
 *
 * Graenser (ufravigelige): ingen mail/SMS til kunde eller montoer, ingen cron/event-trigger (kun manuel
 * admin-knap), ingen flytning/sletning af eksisterende arbejdsordrer, ingen finance.
 * Stale-sikring ved udfoerelse: sagen skal stadig vaere uplanlagt og med samme kunde, montoeren aktiv,
 * datoen ikke passeret og dagen ikke fyldt siden forslaget. Idempotent pr. action (markoer i description)
 * og ét aktivt forslag pr. sag (generations-noegle som tilbudsagenten).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '@/types/common.types'
import type { CapabilityContext, CapabilityResult } from '@/types/agent-core.types'

export const PLANNING_CAPABILITY = 'planning.propose_work_order'
const CLOSED_CASE_STATUSES = ['closed', 'converted']
const ACTIVE_WO_STATUSES = ['planned', 'in_progress']
const INACTIVE_ACTION_STATUSES = ['rejected', 'failed', 'rolled_back']
/** Roller der kan sendes ud paa en opgave (employees_role_check). Laerlinge planlaegges ikke alene. */
export const FIELD_ROLES = ['montør', 'elektriker', 'electrician', 'installer']
export const PLANNING_DEFAULTS = { horizonWorkingDays: 10, maxPerDay: 2, maxCasesPerRun: 20 }

export interface PlanningCase {
  id: string
  case_number: string | null
  title: string
  status: string
  customer_id: string | null
  is_proposal: boolean
}
export interface Technician { id: string; name: string; role: string; active: boolean; termination_date: string | null }
export interface WorkloadEntry { assigned_employee_id: string | null; scheduled_date: string | null; status: string }
export interface Slot { employee_id: string; employee_name: string; scheduled_date: string; load_in_horizon: number }
export interface PlanningPayload {
  case_id: string
  case_number: string | null
  customer_id: string
  title: string
  scheduled_date: string
  assigned_employee_id: string
  employee_name: string
  load_in_horizon: number
}

/** Dagens dato i Koebenhavn som 'YYYY-MM-DD' (planlaegning er lokal kalender, ikke UTC). */
export function copenhagenToday(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(now)
}

/** De naeste n hverdage (man–fre) EFTER `today`. Ren funktion paa dato-strenge. */
export function nextWorkingDays(today: string, n: number): string[] {
  const out: string[] = []
  const d = new Date(`${today}T12:00:00Z`)
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

export function isFieldTechnician(t: Technician, today: string): boolean {
  return t.active && FIELD_ROLES.includes(t.role) && (!t.termination_date || t.termination_date > today)
}

/**
 * Vaelg montoer + dato. Mindst belastede montoer i horisonten (uafgjort -> navn, saa resultatet er
 * deterministisk); foerste hverdag hvor montoeren har < maxPerDay aktive ordrer. null hvis ingen plads.
 */
export function suggestSlot(
  techs: Technician[],
  workload: WorkloadEntry[],
  today: string,
  opts: { horizonWorkingDays?: number; maxPerDay?: number } = {},
): Slot | null {
  const days = nextWorkingDays(today, opts.horizonWorkingDays ?? PLANNING_DEFAULTS.horizonWorkingDays)
  const maxPerDay = opts.maxPerDay ?? PLANNING_DEFAULTS.maxPerDay
  const inHorizon = new Set(days)
  const perDay = new Map<string, number>()
  const load = new Map<string, number>()
  for (const w of workload) {
    if (!w.assigned_employee_id || !w.scheduled_date || !ACTIVE_WO_STATUSES.includes(w.status)) continue
    if (!inHorizon.has(w.scheduled_date)) continue
    perDay.set(`${w.assigned_employee_id}|${w.scheduled_date}`, (perDay.get(`${w.assigned_employee_id}|${w.scheduled_date}`) ?? 0) + 1)
    load.set(w.assigned_employee_id, (load.get(w.assigned_employee_id) ?? 0) + 1)
  }
  const candidates = techs.filter((t) => isFieldTechnician(t, today))
    .sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.name.localeCompare(b.name, 'da'))
  for (const t of candidates) {
    const day = days.find((d) => (perDay.get(`${t.id}|${d}`) ?? 0) < maxPerDay)
    if (day) return { employee_id: t.id, employee_name: t.name, scheduled_date: day, load_in_horizon: load.get(t.id) ?? 0 }
  }
  return null
}

/** Hvorfor sagen ikke maa faa et planlaegningsforslag — eller null. Ren funktion. */
export function planningBlocker(c: PlanningCase, activeWorkOrders: number): string | null {
  if (!c.customer_id) return 'sagen har ingen kunde'
  if (c.is_proposal) return 'sagen er stadig et sagsforslag - bekraeft den foerst'
  if (CLOSED_CASE_STATUSES.includes(c.status)) return `sagen er ${c.status}`
  // X4: enhver ikke-annulleret arbejdsordre (også 'done') — før kun aktive, så afsluttede job fik et nyt forslag
  if (activeWorkOrders > 0) return 'sagen har allerede en arbejdsordre'
  return null
}

export function buildPlanningProposal(c: PlanningCase, activeWorkOrders: number, slot: Slot | null): PlanningPayload | null {
  if (planningBlocker(c, activeWorkOrders) || !slot) return null
  return {
    case_id: c.id, case_number: c.case_number, customer_id: c.customer_id!, title: `Arbejdsordre - ${c.title}`,
    scheduled_date: slot.scheduled_date, assigned_employee_id: slot.employee_id, employee_name: slot.employee_name,
    load_in_horizon: slot.load_in_horizon,
  }
}

const CASE_COLUMNS = 'id, case_number, title, status, customer_id, is_proposal'
const TECH_COLUMNS = 'id, name, role, active, termination_date'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPlanningContext(admin: any, today: string) {
  const days = nextWorkingDays(today, PLANNING_DEFAULTS.horizonWorkingDays)
  const [{ data: techs }, { data: workload }] = await Promise.all([
    admin.from('employees').select(TECH_COLUMNS).eq('active', true),
    admin.from('work_orders').select('assigned_employee_id, scheduled_date, status')
      .in('status', ACTIVE_WO_STATUSES).gte('scheduled_date', days[0]).lte('scheduled_date', days[days.length - 1]),
  ])
  return { techs: (techs ?? []) as Technician[], workload: (workload ?? []) as WorkloadEntry[] }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function activeWorkOrderCount(admin: any, caseId: string): Promise<number> {
  // X4 (planlægnings-review 2026-10-07): tæller alle IKKE-annullerede arbejdsordrer (som planlægningsbackloggen) — en sag
  // hvis job er udført (status 'done'), men som stadig er åben pga. fakturering, må ikke få en ny arbejdsordre foreslået
  const { count } = await admin.from('work_orders').select('id', { count: 'exact', head: true }).eq('case_id', caseId).neq('status', 'cancelled')
  return count ?? 0
}

/**
 * X4: de ældste åbne sager UDEN arbejdsordre (før de 60 ældste åbne sager uanset arbejdsordrer → nye sager blev aldrig
 * nået). Pagineret, så resultatet ikke afhænger af PostgREST's 1.000-rækkers-loft.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unplannedCases(admin: any, limit: number, caseIds?: string[]): Promise<PlanningCase[]> {
  const pageCases = (from: number, to: number) => {
    let q = admin.from('service_cases').select(CASE_COLUMNS).eq('is_proposal', false).not('status', 'in', `(${CLOSED_CASE_STATUSES.join(',')})`)
      .not('customer_id', 'is', null)
    if (caseIds?.length) q = q.in('id', caseIds)
    return q.order('created_at', { ascending: true }).order('id').range(from, to)
  }
  const cases = await fetchAllRows<PlanningCase>(pageCases as never)
  if (!cases.length) return []
  const withWo = new Set<string>()
  for (let k = 0; k < cases.length; k += 200) {
    const ids = cases.slice(k, k + 200).map((c) => c.id)
    const { data } = await admin.from('work_orders').select('case_id').in('case_id', ids).neq('status', 'cancelled')
    for (const w of (data ?? []) as Array<{ case_id: string }>) withWo.add(w.case_id)
  }
  return cases.filter((c) => !withWo.has(c.id)).slice(0, limit)
}

const marker = (actionId: string) => `[agent-action:${actionId}]`

/** Handler (kaldes KUN af Executor efter approval-gating). */
export async function executePlanningProposal(ctx: CapabilityContext): Promise<CapabilityResult> {
  const p = (ctx.action.payload ?? {}) as Partial<PlanningPayload>
  if (!p.case_id || !p.customer_id || !p.scheduled_date || !p.assigned_employee_id || !p.title) {
    return { ok: false, error: 'ufuldstaendigt planlaegningsforslag (payload)' }
  }
  const admin = ctx.admin

  // Idempotens pr. action: allerede oprettet af denne action -> genbrug.
  const { data: mine } = await admin.from('work_orders').select('id').eq('case_id', p.case_id).ilike('description', `%${marker(ctx.action.id)}%`).limit(1)
  if ((mine ?? []).length) return { ok: true, data: { work_order_id: (mine as Array<{ id: string }>)[0].id, created: false } }

  // Stale: sag
  const { data: row } = await admin.from('service_cases').select(CASE_COLUMNS).eq('id', p.case_id).maybeSingle()
  if (!row) return { ok: false, error: 'forældet forslag: sagen findes ikke' }
  const c = row as PlanningCase
  if (c.customer_id !== p.customer_id) return { ok: false, error: 'forældet forslag: sagens kunde er ændret' }
  const blocker = planningBlocker(c, await activeWorkOrderCount(admin, c.id))
  if (blocker) return { ok: false, error: `forældet forslag: ${blocker}` }

  // Stale: dato og montoer
  const today = copenhagenToday()
  if (p.scheduled_date <= today) return { ok: false, error: `forældet forslag: datoen ${p.scheduled_date} er passeret — kør agenten igen` }
  const { data: tech } = await admin.from('employees').select(TECH_COLUMNS).eq('id', p.assigned_employee_id).maybeSingle()
  if (!tech || !isFieldTechnician(tech as Technician, today)) return { ok: false, error: 'forældet forslag: montøren er ikke længere aktiv' }
  const { count: sameDay } = await admin.from('work_orders').select('id', { count: 'exact', head: true })
    .eq('assigned_employee_id', p.assigned_employee_id).eq('scheduled_date', p.scheduled_date).in('status', ACTIVE_WO_STATUSES)
  if ((sameDay ?? 0) >= PLANNING_DEFAULTS.maxPerDay) {
    return { ok: false, error: `forældet forslag: ${p.employee_name ?? 'montøren'} er fuldt booket ${p.scheduled_date} — kør agenten igen` }
  }

  const { data: wo, error } = await admin.from('work_orders').insert({
    case_id: c.id, customer_id: c.customer_id, title: p.title,
    description: `Foreslået af planlægningsagenten og godkendt. ${marker(ctx.action.id)}`,
    scheduled_date: p.scheduled_date, assigned_employee_id: p.assigned_employee_id, status: 'planned',
  }).select('id').single()
  if (error || !wo) return { ok: false, error: (error as { message?: string } | null)?.message ?? 'kunne ikke oprette arbejdsordre' }
  return { ok: true, data: { work_order_id: (wo as { id: string }).id, created: true, scheduled_date: p.scheduled_date, assigned_employee_id: p.assigned_employee_id } }
}

/**
 * Koer planlaegningsagenten (manuel admin-trigger). Opretter forslag; udfoerer intet.
 * `caseIds` begraenser til bestemte sager; ellers de aeldste uplanlagte (max PLANNING_DEFAULTS.maxCasesPerRun).
 */
export async function runPlanningAgent(
  opts: { caseIds?: string[]; triggeredBy?: string | null; dryRun?: boolean; today?: string } = {},
): Promise<ActionResult<{ runId: string | null; cases: number; proposals: number; skipped: Array<{ case_id: string; reason: string }> }>> {
  const admin = createAdminClient()
  const today = opts.today ?? copenhagenToday()

  let rows: PlanningCase[]
  try {
    rows = await unplannedCases(admin, PLANNING_DEFAULTS.maxCasesPerRun * 3, opts.caseIds)
  } catch {
    return { success: false, error: 'Kunne ikke hente sager' }
  }

  const { techs, workload } = await loadPlanningContext(admin, today)
  const skipped: Array<{ case_id: string; reason: string }> = []
  const proposals: PlanningPayload[] = []
  for (const c of rows) {
    if (proposals.length >= PLANNING_DEFAULTS.maxCasesPerRun) break
    const active = await activeWorkOrderCount(admin, c.id)
    const blocker = planningBlocker(c, active)
    if (blocker) { skipped.push({ case_id: c.id, reason: blocker }); continue }
    const { data: open } = await admin.from('agent_actions').select('status').eq('capability', PLANNING_CAPABILITY).eq('payload->>case_id', c.id)
    if (((open ?? []) as Array<{ status: string }>).some((a) => !INACTIVE_ACTION_STATUSES.includes(a.status) && a.status !== 'executed')) {
      skipped.push({ case_id: c.id, reason: 'der findes allerede et planlaegningsforslag' }); continue
    }
    const slot = suggestSlot(techs, workload, today)
    const proposal = buildPlanningProposal(c, active, slot)
    if (!proposal) { skipped.push({ case_id: c.id, reason: 'ingen ledig montør i horisonten' }); continue }
    proposals.push(proposal)
    // Taenk forslaget ind i belastningen, saa samme koersel ikke overbooker én montoer.
    workload.push({ assigned_employee_id: proposal.assigned_employee_id, scheduled_date: proposal.scheduled_date, status: 'planned' })
  }
  if (!proposals.length) return { success: true, data: { runId: null, cases: (rows ?? []).length, proposals: 0, skipped } }

  const { data: cfg } = await admin.from('agent_configs').select('safety_mode').eq('agent_type', 'planning').maybeSingle()
  const { data: run, error: rErr } = await admin.from('agent_runs').insert({
    agent_type: 'planning', trigger: 'manual', triggered_by: opts.triggeredBy ?? null, status: 'running',
    safety_mode: (cfg?.safety_mode as string) ?? 'suggest', dry_run: opts.dryRun ?? false,
    input_context: { case_ids: proposals.map((p) => p.case_id), today },
    summary: `Planlaegningsforslag for ${proposals.length} sag(er)`, started_at: new Date().toISOString(),
  }).select('id').single()
  if (rErr || !run) return { success: false, error: 'Kunne ikke oprette agent-run' }
  const runId = run.id as string

  let created = 0
  for (const [i, p] of proposals.entries()) {
    const { data: task } = await admin.from('agent_tasks').insert({
      run_id: runId, seq: i, kind: 'plan_work_order', title: `Planlæg ${p.case_number ?? ''} "${p.title}"`,
      rationale: 'Sagen er bekræftet og har ingen aktiv arbejdsordre.', target_entity_type: 'service_case', target_entity_id: p.case_id, status: 'proposed',
    }).select('id').single()
    if (!task) continue
    const { count } = await admin.from('agent_actions').select('id', { count: 'exact', head: true })
      .eq('capability', PLANNING_CAPABILITY).eq('payload->>case_id', p.case_id).in('status', [...INACTIVE_ACTION_STATUSES, 'executed'])
    const { error: aErr } = await admin.from('agent_actions').insert({
      task_id: task.id, run_id: runId, action_type: 'plan_work_order', capability: PLANNING_CAPABILITY, side_effect_class: 'create',
      requires_approval: true, min_approvals: 1, idempotency_key: `plan-wo:${p.case_id}:${count ?? 0}`, status: 'awaiting_approval',
      payload: {
        ...p, confidence_level: 'medium', confidence_score: 0.6,
        rationale: `${p.employee_name} har ${p.load_in_horizon} aktive ordrer de næste ${PLANNING_DEFAULTS.horizonWorkingDays} hverdage (lavest); første ledige hverdag er ${p.scheduled_date}. Opretter en intern arbejdsordre efter godkendelse — ingen besked til kunde eller montør.`,
      },
    })
    if (!aErr) created++
    else if ((aErr as { code?: string }).code !== '23505') logger.error('runPlanningAgent: action-insert fejlede', { error: aErr })
  }
  await admin.from('agent_runs').update({ status: created ? 'awaiting_approval' : 'completed', finished_at: new Date().toISOString() }).eq('id', runId)
  return { success: true, data: { runId, cases: (rows ?? []).length, proposals: created, skipped } }
}
