/**
 * PRODUCTION flow-/persona-tjek for 00208 (godkendt 2026-10-09) — ÉN transaktion der ALTID rulles tilbage (ROLLBACK,
 * aldrig COMMIT). Bruger den RIGTIGE prod-montør (SET LOCAL ROLE authenticated + JWT-claims, som i role-probe) på en
 * midlertidig arbejdsordre/timeregistrering tildelt hans egen medarbejder. Printer kun tjek — ingen id'er/persondata.
 *   npx tsx scripts/prod-flow-check-00208.ts [pre|post]
 *
 * post forventer: sale_amount/cost_amount/invoice_line_id/snapshots → 42501; kollegas sats + egen inaktiv sats → afvist;
 * egen aktiv sats → tilladt og godkendelsen nulstilles; sluttid → tilladt og godkendelsen nulstilles; ny registrering
 * (appens INSERT-felter) → tilladt og 'pending'.
 */
import { Client } from 'pg'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'pre' ? 'pre' : 'post'

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-flow-00208-rollback', statement_timeout: 30000 })
  await client.connect()
  const res: Array<[string, boolean, string]> = []
  try {
    await client.query('BEGIN')
    const admin = (await client.query(`SELECT id FROM profiles WHERE is_active AND role = 'admin' ORDER BY created_at LIMIT 1`)).rows[0]?.id as string
    const m = (await client.query(`SELECT p.id pid, e.id eid FROM profiles p JOIN employees e ON e.profile_id = p.id AND e.active
      WHERE p.is_active AND p.role = 'montør' ORDER BY p.created_at LIMIT 1`)).rows[0] as { pid: string; eid: string } | undefined
    if (!admin || !m) throw new Error('mangler aktiv admin eller koblet montør i prod')
    const stamp = Date.now()
    const cust = (await client.query(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by)
      VALUES ($1, '[FLOW-CHECK] rulles tilbage', 'X', $2, $3) RETURNING id`, [`FC8-${stamp}`, `fc8-${stamp}@flow-check.invalid`, admin])).rows[0].id as string
    const sc = (await client.query(`INSERT INTO service_cases (case_number, customer_id, title, status, created_by)
      VALUES ($1, $2, '[FLOW-CHECK] 00208', 'in_progress', $3) RETURNING id`, [`FC8-${stamp}`, cust, admin])).rows[0].id as string
    const wo = (await client.query(`INSERT INTO work_orders (title, case_id, customer_id, status, assigned_employee_id, scheduled_date)
      VALUES ('[FLOW-CHECK] 00208', $1, $2, 'in_progress', $3, current_date) RETURNING id`, [sc, cust, m.eid])).rows[0].id as string
    const colleague = (await client.query(`INSERT INTO employees (name, email, role, active) VALUES ('[FLOW-CHECK] kollega', $1, 'montør', true) RETURNING id`, [`fc8k-${stamp}@flow-check.invalid`])).rows[0].id as string
    const colRate = (await client.query(`INSERT INTO employee_overtime_rates (employee_id, name, code, multiplier) VALUES ($1, 'FC kollega', $2, 2) RETURNING id`, [colleague, `fck${stamp % 100000}`])).rows[0].id as string
    const ownRate = (await client.query(`INSERT INTO employee_overtime_rates (employee_id, name, code, multiplier) VALUES ($1, 'FC egen', $2, 1.5) RETURNING id`, [m.eid, `fce${stamp % 100000}`])).rows[0].id as string
    const ownInactive = (await client.query(`INSERT INTO employee_overtime_rates (employee_id, name, code, multiplier, is_active) VALUES ($1, 'FC egen inaktiv', $2, 3, false) RETURNING id`, [m.eid, `fci${stamp % 100000}`])).rows[0].id as string
    const tl = (await client.query(`INSERT INTO time_logs (employee_id, work_order_id, start_time, end_time, billable)
      VALUES ($1, $2, now() - interval '3 days', now() - interval '3 days' + interval '8 hours', true) RETURNING id`, [m.eid, wo])).rows[0].id as string
    await client.query(`UPDATE time_logs SET approval_status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [tl, admin])

    const asMontor = async (label: string, sql: string, params: unknown[], expectOk: boolean, after?: () => Promise<[boolean, string]>) => {
      await client.query('SAVEPOINT p')
      let ok = false, note = ''
      try {
        await client.query('SET LOCAL ROLE authenticated')
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: m.pid, role: 'authenticated' })])
        const r = await client.query(sql, params)
        await client.query('RESET ROLE')
        ok = expectOk ? (r.rowCount ?? 0) === 1 : false
        note = `tilladt (${r.rowCount} rk)`
        if (after && ok) { const [a, n] = await after(); ok = a; note += ` · ${n}` }
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'fejl'
        ok = !expectOk
        note = `afvist ${code}`
      }
      await client.query('ROLLBACK TO SAVEPOINT p')
      res.push([`montør: ${label} ${expectOk ? '(skal virke)' : '(skal afvises)'}`, mode === 'pre' ? true : ok, note])
    }
    const status = async (): Promise<[boolean, string]> => {
      const s = (await client.query(`SELECT approval_status FROM time_logs WHERE id = $1`, [tl])).rows[0]?.approval_status as string
      return [s === 'pending', `godkendelse=${s}`]
    }
    await asMontor('sale_amount = 0', `UPDATE time_logs SET sale_amount = 0 WHERE id = $1`, [tl], false)
    await asMontor('cost_amount = 9999', `UPDATE time_logs SET cost_amount = 9999 WHERE id = $1`, [tl], false)
    await asMontor('sale/cost_rate_snapshot', `UPDATE time_logs SET sale_rate_snapshot = 1, cost_rate_snapshot = 1 WHERE id = $1`, [tl], false)
    await asMontor('invoice_line_id = NULL', `UPDATE time_logs SET invoice_line_id = NULL WHERE id = $1`, [tl], false)
    await asMontor('kollegas sats', `UPDATE time_logs SET employee_rate_id = $2 WHERE id = $1`, [tl, colRate], false)
    await asMontor('egen INAKTIV sats', `UPDATE time_logs SET employee_rate_id = $2 WHERE id = $1`, [tl, ownInactive], false)
    await asMontor('egen aktiv sats → godkendelse nulstilles', `UPDATE time_logs SET employee_rate_id = $2 WHERE id = $1`, [tl, ownRate], true, status)
    await asMontor('ret sluttid → godkendelse nulstilles', `UPDATE time_logs SET end_time = end_time + interval '30 minutes' WHERE id = $1`, [tl], true, status)
    await asMontor('ny registrering med appens felter', `INSERT INTO time_logs (work_order_id, employee_id, start_time, end_time, pay_rate_type, description, billable)
      VALUES ($1, $2, now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 'normal', '[FLOW-CHECK]', true)`, [wo, m.eid], true)

    const privs = (await client.query(`SELECT string_agg(column_name, ',' ORDER BY column_name) cols FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'time_logs' AND has_column_privilege('authenticated', 'public.time_logs', column_name, 'UPDATE')`)).rows[0].cols as string
    const want = 'billable,description,employee_rate_id,end_time,pay_rate_type,start_time'
    res.push([`UPDATE-kolonner for authenticated ${mode === 'pre' ? '(pre: alle)' : '(post: kun appens 6)'}`, mode === 'pre' ? privs.split(',').length >= 20 : privs === want, privs])
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
  for (const [k, v, note] of res) console.log(`${v ? 'OK  ' : 'AFV '} ${k}  (${note})`)
  const bad = res.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r) — alt rullet tilbage` : `✅ ${res.length} tjek som forventet (${mode}) — alt rullet tilbage`)
  process.exitCode = bad ? 2 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
