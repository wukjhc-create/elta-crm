/**
 * Samtidigheds-/race-tests (P1 #7) — KUN staging. Affyrer centrale operationer PARALLELT (Promise.all) og
 * verificerer at resultatet er praecis det samme som ved serial koersel. Alt oprettet ryddes op.
 *
 *   C1  5x executeAction paa samme godkendte action      -> praecis 1 'executed', resten noop; 1 tilbud
 *   C2  5x runOfferAgent paa samme sag                    -> praecis 1 aktivt forslag
 *   C3  4x handler (forskellige actions) paa samme sag    -> 1 aabent tilbudsforslag (UNIQUE-index), alle faar samme tilbud
 *   C4  8x insertOfferWithNumber samtidigt                -> 8 forskellige tilbudsnumre (retry ved kollision)
 *   C5  3x runFollowupAgent paa samme tilbud              -> forslag kun én gang pr. afsendelses-cyklus
 *   C6  8x insertCustomerWithRetry samtidigt              -> 8 forskellige kundenumre
 * Agenten 'offer'/'followup' aktiveres KUN paa staging inden for scenariet og deaktiveres i finally.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RaceCheck { id: string; ok: boolean; note: string }
type Sql = (sql: string) => Promise<any[]>
const uuidRe = /^[0-9a-f-]{36}$/i
const lit = (v: string) => { if (!uuidRe.test(v)) throw new Error('ikke-uuid'); return `'${v}'` }

export async function runConcurrency(c: { admin: SupabaseClient; sql: Sql; ownerUid: string }): Promise<RaceCheck[]> {
  const out: RaceCheck[] = []
  const runIds = new Set<string>()
  const offerIds = new Set<string>()
  const customerIds = new Set<string>()
  const { runOfferAgent } = await import('../../src/lib/agents/offer-proposal')
  const { runFollowupAgent } = await import('../../src/lib/agents/followup-agent')
  const { executeAction } = await import('../../src/lib/agents/executor')
  const { getCapability } = await import('../../src/lib/agents/capability-registry')
  const { insertOfferWithNumber } = await import('../../src/lib/services/offer-number')
  const { insertCustomerWithRetry } = await import('../../src/lib/customers/customer-number')

  const cases = await c.sql(`SELECT s.id, s.customer_id FROM service_cases s WHERE s.title LIKE '[HARNESS %' AND s.is_proposal = false
    AND s.status NOT IN ('closed','converted') AND s.customer_id IS NOT NULL AND s.source_offer_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM agent_actions a WHERE a.capability='offer.propose_draft_from_case' AND a.payload->>'case_id' = s.id::text)
    AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.source_case_id = s.id) ORDER BY s.id DESC LIMIT 3`)
  if (cases.length < 3) return [{ id: 'setup', ok: false, note: 'mangler 3 egnede harness-sager' }]
  const [A, B, C] = cases
  const offersForCase = async (id: string) => Number((await c.sql(`SELECT count(*) n FROM offers WHERE source_case_id=${lit(id)}`))[0].n)
  const track = async () => {
    for (const r of await c.sql(`SELECT id FROM agent_runs WHERE input_context->>'harness' IS NULL AND created_at > now() - interval '15 minutes'`)) runIds.add(r.id)
  }

  const enable = (t: string) => c.sql(`UPDATE agent_configs SET enabled = true WHERE agent_type = '${t}'`)
  const disable = (t: string) => c.sql(`UPDATE agent_configs SET enabled = false WHERE agent_type = '${t}'`)
  try {
    // C1
    const r1 = await runOfferAgent(A.id, { dryRun: true })
    if (r1.data?.runId) runIds.add(r1.data.runId)
    const act = r1.data?.runId ? (await c.sql(`SELECT id FROM agent_actions WHERE run_id=${lit(r1.data.runId)}`))[0] : undefined
    if (act) {
      await c.admin.from('agent_action_approvals').insert([{ action_id: act.id, decision: 'approved', decided_by: c.ownerUid }])
      await enable('offer')
      try {
        const res = await Promise.all(Array.from({ length: 5 }, () => executeAction(act.id)))
        const statuses = res.map((r) => r.data?.status ?? 'fejl')
        const executed = statuses.filter((s) => s === 'executed').length
        const n = await offersForCase(A.id)
        for (const o of await c.sql(`SELECT id FROM offers WHERE source_case_id=${lit(A.id)}`)) offerIds.add(o.id)
        out.push({ id: 'C1 5x parallel executeAction', ok: executed === 1 && n === 1, note: `udfaldt=[${statuses.join(',')}] tilbud=${n}` })
      } finally { await disable('offer') }
    } else out.push({ id: 'C1 5x parallel executeAction', ok: false, note: `intet forslag: ${r1.data?.reason ?? r1.error}` })

    // C2
    const r2 = await Promise.all(Array.from({ length: 5 }, () => runOfferAgent(B.id, { dryRun: true })))
    for (const r of r2) if (r.data?.runId) runIds.add(r.data.runId)
    const active = Number((await c.sql(`SELECT count(*) n FROM agent_actions WHERE capability='offer.propose_draft_from_case' AND payload->>'case_id' = '${B.id}' AND status NOT IN ('rejected','failed','rolled_back')`))[0].n)
    out.push({ id: 'C2 5x parallel runOfferAgent (samme sag)', ok: active === 1, note: `aktive forslag=${active} · proposals pr. kald=[${r2.map((r) => r.data?.proposals ?? 'fejl').join(',')}]` })

    // C3
    const handler = getCapability('offer.propose_draft_from_case')!.handler!
    const payload = { case_id: C.id, customer_id: C.customer_id, proposed_title: 'Tilbud - race' }
    const fakeIds = ['00000000-0000-4000-8000-00000000c301', '00000000-0000-4000-8000-00000000c302', '00000000-0000-4000-8000-00000000c303', '00000000-0000-4000-8000-00000000c304']
    const r3 = await Promise.all(fakeIds.map((id) => handler({ run: {} as never, admin: c.admin, action: { id, payload } } as never)))
    const ids3 = new Set(r3.map((r) => r.data?.offer_id).filter(Boolean) as string[])
    for (const id of ids3) offerIds.add(id)
    const n3 = await offersForCase(C.id)
    out.push({ id: 'C3 4x parallel handler (UNIQUE source_case_id)', ok: n3 === 1 && ids3.size === 1 && r3.every((r) => r.ok), note: `tilbud=${n3} · forskellige offer_id i svar=${ids3.size} · created=[${r3.map((r) => r.data?.created).join(',')}]` })

    // C4
    const r4 = await Promise.all(Array.from({ length: 8 }, (_, i) => insertOfferWithNumber(c.admin, {
      title: `[HARNESS] race-nummer ${i}`, status: 'draft', created_by: c.ownerUid, total_amount: 0, final_amount: 0, customer_id: A.customer_id, is_proposal: false,
    })))
    const nums = r4.map((r) => r.data?.offer_number).filter(Boolean) as string[]
    for (const r of r4) if (r.data?.id) offerIds.add(r.data.id)
    out.push({ id: 'C4 8x parallel tilbudsnummer', ok: nums.length === 8 && new Set(nums).size === 8, note: `oprettet=${nums.length}/8 · unikke=${new Set(nums).size} · fejl=${r4.filter((r) => r.error).map((r) => r.error?.code).join(',') || '-'}` })

    // C5
    const cust = (await c.sql(`SELECT id FROM customers WHERE custom_fields->>'harness' IS NOT NULL LIMIT 1`))[0]
    const sentAt = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const { data: fo } = await c.admin.from('offers').insert([{ offer_number: `HARNESS-SEC-RACE-${Date.now()}`, title: '[HARNESS] race-opfoelgning', status: 'sent', customer_id: cust.id, created_by: c.ownerUid, sent_at: sentAt, total_amount: 0, final_amount: 0 }]).select('id')
    const foId = (fo?.[0] as { id?: string } | undefined)?.id
    if (foId) {
      offerIds.add(foId)
      const r5 = await Promise.all(Array.from({ length: 3 }, () => runFollowupAgent({ offerIds: [foId], dryRun: true })))
      for (const r of r5) if (r.data?.runId) runIds.add(r.data.runId)
      const acts = Number((await c.sql(`SELECT count(*) n FROM agent_actions WHERE payload->>'offer_id' = '${foId}'`))[0].n)
      out.push({ id: 'C5 3x parallel opfoelgningsagent', ok: acts === 2, note: `actions for tilbuddet=${acts} (forventet 2: udkast+opgave) · proposals=[${r5.map((r) => r.data?.proposals ?? 'fejl').join(',')}]` })
    }

    // C6
    const r6 = await Promise.all(Array.from({ length: 8 }, (_, i) => insertCustomerWithRetry<{ id: string; customer_number: string }>(c.admin, (n) => ({
      customer_number: n, company_name: `[HARNESS] race-kunde ${i}`, contact_person: 'Race', email: `race-${Date.now()}-${i}@harness.test`,
      created_by: c.ownerUid, notes: '[HARNESS]', custom_fields: { harness: 'concurrency' },
    }), { selectClause: 'id, customer_number', label: 'harness-race' })))
    for (const r of r6) if (r.data?.id) customerIds.add(r.data.id)
    const cnums = r6.map((r) => r.data?.customer_number).filter(Boolean) as string[]
    out.push({ id: 'C6 8x parallel kundenummer', ok: cnums.length === 8 && new Set(cnums).size === 8, note: `oprettet=${cnums.length}/8 · unikke=${new Set(cnums).size} · fejl=${r6.filter((r) => r.error).map((r) => r.error?.code).join(',') || '-'}` })
  } finally {
    await disable('offer'); await disable('followup')
    for (const id of customerIds) await c.sql(`DELETE FROM customers WHERE id=${lit(id)}`)
    await track()
    for (const id of offerIds) await c.sql(`DELETE FROM customer_tasks WHERE offer_id=${lit(id)}; DELETE FROM offers WHERE id=${lit(id)};`)
    for (const r of runIds) await c.sql(`DELETE FROM audit_logs WHERE entity_type='agent_action' AND entity_id IN (SELECT id FROM agent_actions WHERE run_id=${lit(r)}); DELETE FROM agent_runs WHERE id=${lit(r)};`)
  }
  return out
}

export function formatConcurrency(c: RaceCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'SAMTIDIGHED / RACE:', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(46)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} race-checks som forventet`].join('\n')
}
