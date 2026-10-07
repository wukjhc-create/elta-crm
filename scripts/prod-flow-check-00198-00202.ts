/**
 * PRODUCTION flow-tjek for 00198 + 00202 (godkendt 2026-10-07) — ÉN transaktion der ALTID rulles tilbage (ROLLBACK,
 * aldrig COMMIT): intet efterlades i prod (fakturanummer-tælleren er en låst tabelrække → rulles også tilbage).
 * Printer kun tjek og tal — ingen id'er/persondata.
 *   npx tsx scripts/prod-flow-check-00198-00202.ts
 *
 * 00198: accepteret tilbud med linje sale_price 0 / unit_price 1000 × 2 → create_invoice_from_offer = 2.000 ekskl. moms.
 * 00202: arbejdsordre med godkendt 2 t + afvist 3 t → create_invoice_from_work_order fakturerer 2 t,
 *        calculate_work_order_profit tæller 2 t, afvist time bindes ikke.
 */
import { Client } from 'pg'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-flow-00198-00202-rollback', statement_timeout: 30000 })
  await client.connect()
  const res: Array<[string, boolean, string]> = []
  try {
    await client.query('BEGIN')
    const admin = (await client.query(`SELECT id FROM profiles WHERE is_active AND role = 'admin' ORDER BY created_at LIMIT 1`)).rows[0]?.id as string
    if (!admin) throw new Error('mangler aktiv admin i prod')
    const stamp = Date.now()
    const cust = (await client.query(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by)
      VALUES ($1, '[FLOW-CHECK] rulles tilbage', 'X', $2, $3) RETURNING id`, [`FC-${stamp}`, `fc-${stamp}@flow-check.invalid`, admin])).rows[0].id as string

    // --- 00198 ---
    const offer = (await client.query(`INSERT INTO offers (offer_number, title, created_by, customer_id, status, accepted_at)
      VALUES ($1, '[FLOW-CHECK] 00198', $2, $3, 'accepted', now()) RETURNING id`, [`FC-${stamp}`, admin, cust])).rows[0].id as string
    await client.query(`INSERT INTO offer_line_items (offer_id, position, description, quantity, unit, unit_price, sale_price, total)
      VALUES ($1, 1, 'Manuel linje', 2, 'stk', 1000, 0, 2000)`, [offer])
    const inv1 = (await client.query(`SELECT create_invoice_from_offer($1, 14) id`, [offer])).rows[0].id as string
    const t1 = (await client.query(`SELECT total_amount::float t, final_amount::float f FROM invoices WHERE id = $1`, [inv1])).rows[0]
    res.push(['00198: faktura fra tilbud = tilbudspris (2.000 ekskl. / 2.500 inkl. moms)', t1.t === 2000 && t1.f === 2500, `${t1.t}/${t1.f}`])

    // --- 00202 ---
    const sc = (await client.query(`INSERT INTO service_cases (case_number, customer_id, title, status, created_by)
      VALUES ($1, $2, '[FLOW-CHECK] 00202', 'in_progress', $3) RETURNING id`, [`FC-${stamp}`, cust, admin])).rows[0].id as string
    const emp = (await client.query(`INSERT INTO employees (name, email, role, active, hourly_rate) VALUES ('[FLOW-CHECK]', $1, 'montør', true, 500) RETURNING id`, [`fce-${stamp}@flow-check.invalid`])).rows[0].id as string
    const wo = (await client.query(`INSERT INTO work_orders (title, case_id, customer_id, status, assigned_employee_id) VALUES ('[FLOW-CHECK]', $1, $2, 'done', $3) RETURNING id`, [sc, cust, emp])).rows[0].id as string
    await client.query(`INSERT INTO time_logs (employee_id, work_order_id, start_time, end_time, billable, approval_status)
      VALUES ($1, $2, now() - interval '2 days', now() - interval '2 days' + interval '2 hours', true, 'approved')`, [emp, wo])
    const rej = (await client.query(`INSERT INTO time_logs (employee_id, work_order_id, start_time, end_time, billable, approval_status, rejection_reason)
      VALUES ($1, $2, now() - interval '1 day', now() - interval '1 day' + interval '3 hours', true, 'rejected', 'flow-check') RETURNING id`, [emp, wo])).rows[0].id as string
    const prof = (await client.query(`SELECT calculate_work_order_profit($1) p`, [wo])).rows[0].p as Record<string, unknown>
    res.push(['00202: avance tæller kun godkendte timer (2 t)', Number(prof.total_hours) === 2, `timer=${prof.total_hours}`])
    const inv2 = (await client.query(`SELECT create_invoice_from_work_order($1, 14, 495) id`, [wo])).rows[0].id as string
    const hrs = (await client.query(`SELECT coalesce(sum(quantity), 0)::float h FROM invoice_lines WHERE invoice_id = $1 AND unit = 'time'`, [inv2])).rows[0].h as number
    const rejBound = (await client.query(`SELECT invoice_line_id FROM time_logs WHERE id = $1`, [rej])).rows[0].invoice_line_id
    res.push(['00202: faktura fra arbejdsordre = 2 t (afvist ikke faktureret)', hrs === 2 && rejBound === null, `timer=${hrs}`])
    res.push(['00202: godkendte timer uændret faktureret (sats 500 × 2)', (await client.query(`SELECT coalesce(sum(total_price), 0)::float t FROM invoice_lines WHERE invoice_id = $1 AND unit = 'time'`, [inv2])).rows[0].t === 1000, ''])
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r) — alt rullet tilbage` : `✅ ${res.length} flow-tjek som forventet — alt rullet tilbage`)
  process.exitCode = bad ? 2 : 0
}

main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
