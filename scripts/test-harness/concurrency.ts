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
 *   C7  4x del-faktura paa samme sag (time + materiale)   -> hver kilde-raekke paa praecis 1 fakturalinje (ingen dobbelt-fakturering)
 *   C8  slutfaktura + 2x del-faktura samtidigt            -> hver kilde-raekke paa praecis 1 linje; ingen halv slutfaktura
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
  const { createInvoiceDraftFromCase } = await import('../../src/lib/services/invoice-from-case')
  const { createFinalInvoiceForCase } = await import('../../src/lib/services/invoice-stage')
  const billCases: Array<{ caseId: string; woId: string; empId: string }> = []

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
    // C7/C8 — samtidig fakturering af samme sag
    const billCustomer = [...customerIds][0]
    const seedBillCase = async (tag: string) => {
      const { data: emp } = await c.admin.from('employees').insert([{ name: `[HARNESS] race-${tag}`, email: `race-${tag}-${Date.now()}@harness.test`, role: 'montør', active: true, hourly_rate: 500 }]).select('id').single()
      const { data: sc } = await c.admin.from('service_cases').insert([{ title: `[HARNESS] race-faktura ${tag}`, customer_id: billCustomer, status: 'in_progress', priority: 'medium', source: 'manual', created_by: c.ownerUid }]).select('id').single()
      const { data: wo } = await c.admin.from('work_orders').insert([{ case_id: sc!.id, title: 'race', status: 'done', assigned_employee_id: emp!.id }]).select('id').single()
      billCases.push({ caseId: sc!.id, woId: wo!.id, empId: emp!.id })
      const t0 = Date.now() - 86400_000
      const { data: tl } = await c.admin.from('time_logs').insert([{ employee_id: emp!.id, work_order_id: wo!.id, start_time: new Date(t0).toISOString(), end_time: new Date(t0 + 3600_000).toISOString(), billable: true }]).select('id').single()
      const { data: m } = await c.admin.from('case_materials').insert([{ case_id: sc!.id, description: 'race-materiale', quantity: 1, unit: 'stk', unit_cost: 10, unit_sales_price: 20, billable: true, source: 'manual', created_by: c.ownerUid }]).select('id').single()
      return { caseId: sc!.id as string, tlId: tl!.id as string, mId: m!.id as string }
    }
    const lineCounts = async (caseId: string, tlId: string, mId: string) => {
      const rows = await c.sql(`SELECT il.source_time_log_id t, il.source_case_material_id m FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id WHERE i.case_id = ${lit(caseId)}`)
      return { t: rows.filter((r) => r.t === tlId).length, m: rows.filter((r) => r.m === mId).length,
        invoices: Number((await c.sql(`SELECT count(*) n FROM invoices WHERE case_id = ${lit(caseId)}`))[0].n) }
    }
    if (billCustomer) {
      const s7 = await seedBillCase('c7')
      const r7 = await Promise.all(Array.from({ length: 4 }, () => createInvoiceDraftFromCase(s7.caseId, c.ownerUid, { time_log_ids: [s7.tlId], case_material_ids: [s7.mId] }).catch((e) => ({ ok: false, message: String(e) }))))
      const n7 = await lineCounts(s7.caseId, s7.tlId, s7.mId)
      out.push({ id: 'C7 4x parallel del-faktura samme sag', ok: n7.t === 1 && n7.m === 1, note: `time på ${n7.t} linje(r) · materiale på ${n7.m} linje(r) · fakturaer=${n7.invoices} · ok=${r7.filter((r) => r.ok).length}/4` })

      const s8 = await seedBillCase('c8')
      const r8 = await Promise.all([
        createFinalInvoiceForCase({ case_id: s8.caseId }, c.ownerUid).catch((e) => ({ ok: false, message: String(e) })),
        createInvoiceDraftFromCase(s8.caseId, c.ownerUid, { time_log_ids: [s8.tlId], case_material_ids: [s8.mId] }).catch((e) => ({ ok: false, message: String(e) })),
        createInvoiceDraftFromCase(s8.caseId, c.ownerUid, { time_log_ids: [s8.tlId], case_material_ids: [s8.mId] }).catch((e) => ({ ok: false, message: String(e) })),
      ])
      const n8 = await lineCounts(s8.caseId, s8.tlId, s8.mId)
      const finals = await c.sql(`SELECT i.id, (SELECT count(*) FROM invoice_lines il WHERE il.invoice_id = i.id) n FROM invoices i WHERE i.case_id = ${lit(s8.caseId)} AND i.invoice_type = 'final'`)
      const halfFinal = finals.some((f) => Number(f.n) === 0)
      out.push({ id: 'C8 slutfaktura + 2x del-faktura samtidigt', ok: n8.t === 1 && n8.m === 1 && !halfFinal, note: `time på ${n8.t} · materiale på ${n8.m} · slutfakturaer=${finals.length}${halfFinal ? ' (TOM!)' : ''} · fakturaer=${n8.invoices} · ok=[${r8.map((r) => (r.ok ? 'ja' : 'nej')).join(',')}]` })
    }

    out.push({ id: 'C6 8x parallel kundenummer', ok: cnums.length === 8 && new Set(cnums).size === 8, note: `oprettet=${cnums.length}/8 · unikke=${new Set(cnums).size} · fejl=${r6.filter((r) => r.error).map((r) => r.error?.code).join(',') || '-'}` })
  } finally {
    await disable('offer'); await disable('followup')
    for (const b of billCases) {
      const cid = lit(b.caseId), wid = lit(b.woId)
      await c.sql(`UPDATE time_logs SET invoice_line_id = NULL WHERE work_order_id = ${wid}; UPDATE case_materials SET invoice_line_id = NULL WHERE case_id = ${cid};
        DELETE FROM invoice_predecessors WHERE invoice_id IN (SELECT id FROM invoices WHERE case_id = ${cid});
        DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM invoices WHERE case_id = ${cid});
        DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE case_id = ${cid});
        DELETE FROM invoices WHERE case_id = ${cid};
        DELETE FROM time_logs WHERE work_order_id = ${wid}; DELETE FROM work_orders WHERE id = ${wid};
        DELETE FROM case_materials WHERE case_id = ${cid}; DELETE FROM service_cases WHERE id = ${cid}; DELETE FROM employees WHERE id = ${lit(b.empId)};`)
    }
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
