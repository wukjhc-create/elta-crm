/**
 * PRODUCTION flow-/persona-tjek for 00212–00217 (godkendt 2026-10-10) — ÉN transaktion der ALTID rulles tilbage
 * (ROLLBACK, aldrig COMMIT). Rigtige prod-personaer (SET LOCAL ROLE authenticated + JWT-claims). Salg findes ikke i prod
 * → en montør-profil sættes midlertidigt til 'salg' INDE i transaktionen (rulles tilbage). Printer kun tjek.
 *   npx tsx scripts/prod-flow-check-00212-00217.ts [pre|post] [00212 00213 ...]
 * pre: hullerne forventes ÅBNE (afvigelser er "OK" så længe tjekket kørte); post: hullerne skal være LUKKEDE.
 */
import { Client } from 'pg'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'pre' ? 'pre' : 'post'
const only = process.argv.slice(3).filter((a) => /^002\d\d$/.test(a))
const want = (nr: string) => only.length === 0 || only.includes(nr)

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-flow-00212-00217-rollback', statement_timeout: 30000 })
  await client.connect()
  const res: Array<[string, boolean, string]> = []
  const push = (label: string, closedOk: boolean, note: string) => res.push([`${label}`, mode === 'pre' ? true : closedOk, note])
  try {
    await client.query('BEGIN')
    const admin = (await client.query(`SELECT id FROM profiles WHERE is_active AND role = 'admin' ORDER BY created_at LIMIT 1`)).rows[0]?.id as string
    const m = (await client.query(`SELECT p.id pid, e.id eid FROM profiles p JOIN employees e ON e.profile_id = p.id AND e.active
      WHERE p.is_active AND p.role = 'montør' ORDER BY p.created_at LIMIT 1`)).rows[0] as { pid: string; eid: string } | undefined
    const m2 = (await client.query(`SELECT id FROM profiles WHERE is_active AND role = 'montør' AND id <> $1 ORDER BY created_at LIMIT 1`, [m?.pid ?? '00000000-0000-0000-0000-000000000000'])).rows[0]?.id as string | undefined
    if (!admin || !m) throw new Error('mangler aktiv admin eller koblet montør i prod')
    const stamp = Date.now()

    const as = async (pid: string, label: string, sql: string, params: unknown[]) => {
      await client.query('SAVEPOINT p')
      try {
        await client.query('SET LOCAL ROLE authenticated')
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: pid, role: 'authenticated' })])
        const r = await client.query(sql, params)
        await client.query('RESET ROLE')
        await client.query('RELEASE SAVEPOINT p')
        return { ok: true, rows: r.rows, count: r.rowCount ?? 0, code: '' }
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT p')
        return { ok: false, rows: [], count: 0, code: (e as { code?: string }).code ?? 'fejl' }
      }
      void label
    }
    const blocked = (r: { ok: boolean; count: number }) => !r.ok || r.count === 0

    // fælles testdata (rulles tilbage)
    const cust = (await client.query(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by)
      VALUES ($1, '[FLOW-CHECK] 00212-17', 'X', $2, $3) RETURNING id`, [`FC2-${stamp}`, `fc2-${stamp}@flow-check.invalid`, admin])).rows[0].id as string
    const mkCase = async (n: number) => (await client.query(`INSERT INTO service_cases (case_number, customer_id, title, status, created_by)
      VALUES ($1, $2, '[FLOW-CHECK]', 'in_progress', $3) RETURNING id`, [`FC2-${stamp}-${n}`, cust, admin])).rows[0].id as string

    if (want('00212')) {
      const mr = await as(m.pid, 'm', `SELECT count(*)::int n FROM system_health_log`, [])
      const ar = await as(admin, 'a', `SELECT count(*)::int n FROM system_health_log`, [])
      const mn = mr.rows[0]?.n ?? -1, an = ar.rows[0]?.n ?? -1
      push('00212 montør ser ingen driftslog', mn === 0, `montør=${mn} admin=${an}`)
      res.push(['00212 admin ser stadig driftsloggen', an > 0, `admin=${an}`])
    }

    if (want('00213')) {
      const c1 = await mkCase(1), c2 = await mkCase(2)
      const wo = (await client.query(`INSERT INTO work_orders (title, case_id, customer_id, status, assigned_employee_id, scheduled_date)
        VALUES ('[FLOW-CHECK]', $1, $2, 'in_progress', $3, current_date) RETURNING id`, [c1, cust, m.eid])).rows[0].id as string
      const cancelled = (await client.query(`INSERT INTO work_orders (title, case_id, customer_id, status, assigned_employee_id, scheduled_date)
        VALUES ('[FLOW-CHECK]', $1, $2, 'cancelled', $3, current_date) RETURNING id`, [c1, cust, m.eid])).rows[0].id as string
      const r1 = await as(m.pid, 'm', `UPDATE work_orders SET case_id = $2, status = 'in_progress' WHERE id = $1 RETURNING id`, [wo, c2])
      push('00213 montør kan ikke flytte egen ordre til anden sag', blocked(r1), r1.ok ? `rækker=${r1.count}` : r1.code)
      const r2 = await as(m.pid, 'm', `UPDATE work_orders SET status = 'done' WHERE id = $1 RETURNING id`, [cancelled])
      push('00213 montør kan ikke gøre annulleret ordre done', blocked(r2), r2.ok ? `rækker=${r2.count}` : r2.code)
      const r3 = await as(m.pid, 'm', `UPDATE work_orders SET status = 'done', completed_at = now() WHERE id = $1 RETURNING id`, [wo])
      res.push(['00213 montør kan stadig afslutte egen ordre (in_progress→done)', r3.ok && r3.count === 1, r3.ok ? `rækker=${r3.count}` : r3.code])
    }

    if (want('00214')) {
      const diff = (await client.query(`SELECT count(*)::int n FROM v_customer_payment_summary v
        LEFT JOIN (
          SELECT i.customer_id, sum(greatest(0, coalesce(i.final_amount,0) - coalesce(i.amount_paid,0) - coalesce((
            SELECT sum(abs(c.final_amount)) FROM invoices c WHERE c.credit_of_invoice_id = i.id AND c.invoice_type = 'credit'
              AND c.status IN ('sent','paid') AND c.voided_at IS NULL), 0))) open_total
          FROM invoices i WHERE i.status = 'sent' AND i.voided_at IS NULL AND coalesce(i.invoice_type,'standard') <> 'credit' AND i.customer_id IS NOT NULL
          GROUP BY i.customer_id) e ON e.customer_id = v.customer_id
        WHERE abs(coalesce(v.outstanding_total,0) - coalesce(e.open_total,0)) > 0.01`)).rows[0].n as number
      push('00214 betalingsoversigt = åbent beløb pr. kunde', diff === 0, `afvigende kunder=${diff}`)
    }

    if (want('00215') || want('00216')) {
      const offer = async (n: number) => (await client.query(`INSERT INTO offers (offer_number, title, customer_id, status, discount_percentage, tax_percentage, created_by)
        VALUES ($1, '[FLOW-CHECK]', $2, 'draft', 12.5, 25, $3) RETURNING id`, [`FC2-${stamp}-${n}`, cust, admin])).rows[0].id as string
      const draft = await offer(1)
      await client.query(`INSERT INTO offer_line_items (offer_id, position, description, quantity, unit, unit_price, total) VALUES ($1, 1, 'x', 1, 'stk', 100.04, 100.04)`, [draft])
      if (want('00216')) {
        const fin = Number((await client.query(`SELECT final_amount FROM offers WHERE id = $1`, [draft])).rows[0].final_amount)
        push('00216 100,04 med 12,5 % rabat → 109,41 (trinvis)', fin === 109.41, `total=${fin}`)
      }
      if (want('00215')) {
        const sent = await offer(2)
        await client.query(`INSERT INTO offer_line_items (offer_id, position, description, quantity, unit, unit_price, total) VALUES ($1, 1, 'x', 1, 'stk', 100, 100)`, [sent])
        await client.query(`UPDATE offers SET status = 'sent', sent_at = now() WHERE id = $1`, [sent])
        const salgPid = m2 ?? m.pid
        await client.query(`UPDATE profiles SET role = 'salg' WHERE id = $1`, [salgPid]) // rulles tilbage
        const r1 = await as(salgPid, 's', `UPDATE offer_line_items SET unit_price = 1, total = 1 WHERE offer_id = $1 RETURNING id`, [sent])
        push('00215 salg kan ikke ændre linje på sendt tilbud', blocked(r1), r1.ok ? `rækker=${r1.count}` : r1.code)
        const r2 = await as(salgPid, 's', `UPDATE offers SET discount_percentage = 90 WHERE id = $1 RETURNING id`, [sent])
        push('00215 salg kan ikke ændre rabat på sendt tilbud', blocked(r2), r2.ok ? `rækker=${r2.count}` : r2.code)
        const r3 = await as(salgPid, 's', `UPDATE offers SET is_proposal = true WHERE id = $1 RETURNING id`, [sent])
        push('00215 salg kan ikke gøre tilbud til forslag', blocked(r3), r3.ok ? `rækker=${r3.count}` : r3.code)
        const r4 = await as(salgPid, 's', `UPDATE offers SET notes = 'intern' WHERE id = $1 RETURNING id`, [sent])
        res.push(['00215 salg kan stadig skrive interne noter', r4.ok && r4.count === 1, r4.ok ? `rækker=${r4.count}` : r4.code])
        const r5 = await as(salgPid, 's', `UPDATE offer_line_items SET unit_price = 200, total = 200 WHERE offer_id = $1 RETURNING id`, [draft])
        res.push(['00215 salg kan stadig ændre linjer på kladde', r5.ok && r5.count === 1, r5.ok ? `rækker=${r5.count}` : r5.code])
      }
    }

    if (want('00217')) {
      const fake = await as(m.pid, 'm', `INSERT INTO messages (subject, body, from_user_id, from_name, from_email, to_user_id)
        VALUES ('[FLOW-CHECK]', 'x', $1, 'Henrik (admin)', 'falsk@flow-check.invalid', $2) RETURNING id, from_name`, [m.pid, admin])
      const prof = (await client.query(`SELECT full_name FROM profiles WHERE id = $1`, [m.pid])).rows[0]?.full_name as string | null
      const stored = fake.rows[0]?.from_name as string | undefined
      push('00217 afsendernavn kommer fra profilen', fake.ok && stored === prof, fake.ok ? (stored === 'Henrik (admin)' ? 'FALSK navn gemt' : 'profilnavn') : fake.code)
      if (fake.ok) {
        const id = fake.rows[0].id as string
        const u1 = await as(admin, 'a', `UPDATE messages SET body = 'omskrevet' WHERE id = $1 RETURNING id`, [id])
        push('00217 modtager kan ikke omskrive beskeden', blocked(u1), u1.ok ? `rækker=${u1.count}` : u1.code)
        const u2 = await as(admin, 'a', `UPDATE messages SET status = 'read', read_at = now() WHERE id = $1 RETURNING id`, [id])
        res.push(['00217 modtager kan stadig markere læst', u2.ok && u2.count === 1, u2.ok ? `rækker=${u2.count}` : u2.code])
      }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
  for (const [k, v, note] of res) console.log(`${v ? 'OK  ' : 'AFV '} ${k}  (${note})`)
  const bad = res.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r) (${mode}) — alt rullet tilbage` : `✅ ${res.length} tjek som forventet (${mode}) — alt rullet tilbage`)
  process.exitCode = bad ? 2 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
