/**
 * PRODUCTION effektiv kontrol for 00235 (SEC-B7) — ROLLBACK-ONLY.
 *
 * Skrive-RLS kan ikke prøves i en READ ONLY-transaktion (Postgres afviser skrivningen før RLS). Derfor:
 *   - ÉN transaktion der ALTID afsluttes med ROLLBACK (der udstedes aldrig COMMIT; scriptet afviser SQL med COMMIT)
 *   - hver prøve i sin egen SAVEPOINT og rulles tilbage til den bagefter (prøverne er uafhængige)
 *   - rigtige prod-profiler (ingen nye brugere): SET LOCAL ROLE authenticated + request.jwt.claims {sub, role}
 *   - kun DB-interne triggere på tabellerne (updated_at, guards, done-snapshot) — intet forlader transaktionen
 *   - output: kun PASS/FAIL + antal/fejlkoder — ingen id'er, navne eller indhold
 * Roller uden profil i prod (serviceleder, salg, bogholderi) rapporteres NOT_TESTABLE_PROD (dækket af staging-matrixen).
 *   npx tsx scripts/prod-sec-b7-effective.ts            (forventning før 00235: [NY] fejler; efter: alt PASS)
 */
import { Client } from 'pg'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'

type Res = { ok: true; rows: any[] } | { ok: false; code: string }
type Kind = 'NY' | 'UÆNDRET'

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref — afbryder')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-sec-b7-effective-rollback-only', statement_timeout: 30000 })
  await client.connect()
  const out: Array<{ kind: Kind | 'NOT_TESTABLE_PROD'; id: string; ok: boolean; note: string }> = []
  const q = async (sql: string, params: unknown[] = []) => {
    if (/\bcommit\b/i.test(sql)) throw new Error('COMMIT er forbudt i dette script')
    return (await client.query(sql, params)).rows
  }
  /** Kør sql som en rigtig profil (eller anon) i en savepoint, der altid rulles tilbage */
  const as = async (who: { uid: string } | 'anon', sql: string, params: unknown[] = [], setup?: string[]): Promise<Res> => {
    await q('SAVEPOINT probe')
    try {
      for (const s of setup ?? []) await q(s)
      if (who === 'anon') await q('SET LOCAL ROLE anon')
      else {
        await q('SET LOCAL ROLE authenticated')
        await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.uid, role: 'authenticated' })])
      }
      const rows = await q(sql, params)
      return { ok: true, rows }
    } catch (e) {
      return { ok: false, code: (e as { code?: string }).code ?? 'fejl' }
    } finally {
      await q('ROLLBACK TO SAVEPOINT probe')
      await q('RESET ROLE')
    }
  }
  const add = (kind: Kind, id: string, ok: boolean, note: string) => out.push({ kind, id, ok, note })
  const allowed1 = (r: Res) => r.ok && r.rows.length === 1
  const denied = (r: Res) => !r.ok || r.rows.length === 0
  const why = (r: Res) => (r.ok ? `rækker=${r.rows.length}` : r.code)

  try {
    await q('BEGIN')
    await q('SET LOCAL statement_timeout = 30000')
    console.log(`[sec-b7-effective] prod:${ref.slice(0, 6)}… | ÉN transaktion, ROLLBACK til sidst — intet committes`)

    // ---- personas (rigtige profiler; ingen oprettes)
    const montor = (await q(`SELECT p.id uid, e.id emp FROM profiles p JOIN employees e ON e.profile_id = p.id AND e.active
      WHERE p.is_active AND p.role::text = 'montør' AND EXISTS (SELECT 1 FROM work_orders w WHERE w.assigned_employee_id = e.id AND w.status = 'planned')
      ORDER BY p.created_at LIMIT 1`))[0] as { uid: string; emp: string } | undefined
    const admin = (await q(`SELECT id uid FROM profiles WHERE is_active AND role::text = 'admin' ORDER BY created_at LIMIT 1`))[0] as { uid: string } | undefined
    for (const role of ['serviceleder', 'salg', 'bogholderi']) {
      const has = (await q(`SELECT count(*)::int n FROM profiles WHERE is_active AND role::text = $1`, [role]))[0].n
      if (!has) out.push({ kind: 'NOT_TESTABLE_PROD', id: `${role}: ingen aktiv profil i prod`, ok: true, note: 'dækket af staging sec-b7-rls-check' })
    }
    if (!montor || !admin) throw new Error('mangler montør med planlagt arbejdsordre eller admin-profil i prod')

    const wo = (await q(`SELECT w.id, w.case_id, sc.customer_id FROM work_orders w JOIN service_cases sc ON sc.id = w.case_id
      WHERE w.assigned_employee_id = $1 AND w.status = 'planned' ORDER BY w.created_at LIMIT 1`, [montor.emp]))[0] as { id: string; case_id: string; customer_id: string }
    const foreignCust = (await q(`SELECT c.id FROM customers c WHERE NOT EXISTS (SELECT 1 FROM service_cases sc JOIN work_orders w ON w.case_id = sc.id
      WHERE sc.customer_id = c.id AND w.assigned_employee_id = $1) ORDER BY c.created_at LIMIT 1`, [montor.emp]))[0] as { id: string }
    const foreignCase = (await q(`SELECT sc.id, sc.customer_id FROM service_cases sc WHERE NOT EXISTS (SELECT 1 FROM work_orders w JOIN employees e ON e.id = w.assigned_employee_id
      WHERE w.case_id = sc.id AND e.profile_id = $1) AND sc.assigned_to IS DISTINCT FROM $1 AND sc.created_by IS DISTINCT FROM $1 ORDER BY sc.created_at LIMIT 1`, [montor.uid]))[0] as { id: string; customer_id: string } | undefined
    const othersTask = (await q(`SELECT id FROM customer_tasks WHERE assigned_to IS DISTINCT FROM $1 AND created_by IS DISTINCT FROM $1 ORDER BY created_at LIMIT 1`, [montor.uid]))[0] as { id: string }
    const caselessDrawing = (await q(`SELECT id FROM roof_drawings ORDER BY created_at LIMIT 1`))[0] as { id: string } | undefined
    const M = { uid: montor.uid }
    const A = { uid: admin.uid }
    const taskCols = `(customer_id, title, status, priority, assigned_to, created_by)`
    const drawVals = (cust: string, cse: string | null, by: string) =>
      [cust, cse, '[SEC-B7 rollback-prøve]', 'roof-drawings/rollback/none.png', 1, 1, null, 0, '{"panels":[]}', by]
    const drawSql = `INSERT INTO roof_drawings (customer_id, service_case_id, title, image_storage_path, image_width, image_height, panel_product_code, panel_count, drawing_data, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10) RETURNING id`

    // ================= MONTØR =================
    let r = await as(M, `INSERT INTO customer_tasks ${taskCols} VALUES ($1, '[SEC-B7 rollback-prøve]', 'pending', 'normal', $2, $2) RETURNING id`, [wo.customer_id, montor.uid])
    add('UÆNDRET', 'M1 montør opretter egen opgave hos kunde med eget job', allowed1(r), why(r))
    r = await as(M, `UPDATE customer_tasks SET status = 'done', completed_at = now() WHERE id = (SELECT id FROM customer_tasks WHERE title = '[SEC-B7 rollback-prøve]' LIMIT 1) RETURNING id`, [],
      [`INSERT INTO customer_tasks ${taskCols} VALUES ('${wo.customer_id}', '[SEC-B7 rollback-prøve]', 'pending', 'normal', '${montor.uid}', '${admin.uid}')`])
    add('UÆNDRET', 'M2 montør afslutter opgave tildelt sig selv', allowed1(r), why(r))
    r = await as(M, `INSERT INTO customer_tasks ${taskCols} VALUES ($1, '[SEC-B7 rollback-prøve]', 'pending', 'normal', $2, $2) RETURNING id`, [foreignCust.id, montor.uid])
    add('NY', 'M3 montør kan ikke oprette opgave uden for eget scope', denied(r), why(r))
    r = await as(M, `INSERT INTO customer_tasks ${taskCols} VALUES ($1, '[SEC-B7 rollback-prøve]', 'pending', 'normal', $2, $3) RETURNING id`, [wo.customer_id, admin.uid, montor.uid])
    add('NY', 'M4 montør kan ikke tildele opgave til en anden', denied(r), why(r))
    r = await as(M, `INSERT INTO customer_tasks ${taskCols} VALUES ($1, '[SEC-B7 rollback-prøve]', 'pending', 'normal', $2, $3) RETURNING id`, [wo.customer_id, montor.uid, admin.uid])
    add('NY', 'M5 montør kan ikke forfalske created_by', denied(r), why(r))
    r = await as(M, `UPDATE customer_tasks SET status = 'done' WHERE id = $1 RETURNING id`, [othersTask.id])
    add('NY', 'M6 montør kan ikke ændre en andens opgave', denied(r), why(r))
    r = await as(M, `DELETE FROM customer_tasks WHERE id = $1 RETURNING id`, [othersTask.id])
    add('NY', 'M7 montør kan ikke slette en andens opgave', denied(r), why(r))
    r = await as(M, drawSql, drawVals(wo.customer_id, wo.case_id, montor.uid))
    add('UÆNDRET', 'M8 montør opretter tagtegning på egen sag', allowed1(r), why(r))
    r = await as(M, `UPDATE roof_drawings SET panel_count = 2 WHERE title = '[SEC-B7 rollback-prøve]' RETURNING id`, [], [`INSERT INTO roof_drawings (customer_id, service_case_id, title, image_storage_path, image_width, image_height, panel_count, drawing_data, created_by)
      VALUES ('${wo.customer_id}', '${wo.case_id}', '[SEC-B7 rollback-prøve]', 'roof-drawings/rollback/none.png', 1, 1, 0, '{"panels":[]}', '${montor.uid}')`])
    add('UÆNDRET', 'M9 montør gemmer egen tagtegning', allowed1(r), why(r))
    if (foreignCase) {
      r = await as(M, drawSql, drawVals(foreignCase.customer_id, foreignCase.id, montor.uid))
      add('NY', 'M10 montør kan ikke tegne på en anden sag', denied(r), why(r))
    }
    if (caselessDrawing) {
      r = await as(M, `UPDATE roof_drawings SET panel_count = 9 WHERE id = $1 RETURNING id`, [caselessDrawing.id])
      add('NY', 'M11 montør kan ikke ændre en tegning uden for eget scope', denied(r), why(r))
      r = await as(M, `DELETE FROM roof_drawings WHERE id = $1 RETURNING id`, [caselessDrawing.id])
      add('NY', 'M12 montør kan ikke slette en tegning uden for eget scope', denied(r), why(r))
    }
    r = await as(M, `UPDATE work_orders SET status = 'in_progress' WHERE id = $1 RETURNING id`, [wo.id])
    add('UÆNDRET', 'M13 montør starter egen arbejdsordre', allowed1(r), why(r))
    r = await as(M, `UPDATE work_orders SET status = 'done', completed_at = '2020-01-01T00:00:00Z' WHERE id = $1 RETURNING completed_at`, [wo.id])
    add('UÆNDRET', 'M14 montør afslutter egen arbejdsordre', allowed1(r), why(r))
    const at = r.ok && r.rows[0] ? new Date(r.rows[0].completed_at).getTime() : 0
    add('NY', 'M15 completed_at kan ikke tilbagedateres (DB sætter nu)', at > 0 && Math.abs(at - Date.now()) < 10 * 60_000, r.ok ? (at < Date.UTC(2021, 0, 1) ? 'tilbagedateret' : 'nu') : r.code)
    r = await as(M, `UPDATE work_orders SET status = 'in_progress' WHERE id = $1 RETURNING id`, [wo.id], [`UPDATE service_cases SET status = 'closed' WHERE id = '${wo.case_id}'`])
    add('NY', 'M16 montør kan ikke ændre arbejdsordre på lukket sag', denied(r), why(r))
    r = await as(M, `UPDATE work_orders SET assigned_employee_id = NULL, status = 'in_progress' WHERE id = $1 RETURNING id`, [wo.id])
    add('UÆNDRET', 'M17 00213 bevaret: montør kan ikke ændre tildeling', denied(r), why(r))

    // ================= KONTOR (admin; øvrige kontorroller NOT_TESTABLE_PROD) =================
    r = await as(A, `INSERT INTO customer_tasks ${taskCols} VALUES ($1, '[SEC-B7 rollback-prøve]', 'pending', 'normal', $2, $3) RETURNING id`, [foreignCust.id, montor.uid, admin.uid])
    add('UÆNDRET', 'O1 admin opretter opgave til en anden', allowed1(r), why(r))
    r = await as(A, `UPDATE customer_tasks SET priority = priority WHERE id = $1 RETURNING id`, [othersTask.id])
    add('UÆNDRET', 'O2 admin ændrer enhver opgave', allowed1(r), why(r))
    r = await as(A, drawSql, drawVals(foreignCust.id, null, admin.uid))
    add('UÆNDRET', 'O3 admin opretter tagtegning uden sag', allowed1(r), why(r))
    if (caselessDrawing) {
      r = await as(A, `UPDATE roof_drawings SET panel_count = panel_count WHERE id = $1 RETURNING id`, [caselessDrawing.id])
      add('UÆNDRET', 'O4 admin gemmer eksisterende tagtegning', allowed1(r), why(r))
    }
    r = await as(A, `UPDATE customer_tasks SET created_by = $2 WHERE id = $1 RETURNING id`, [othersTask.id, montor.uid])
    add('NY', 'O5 created_by kan ikke ændres (heller ikke af admin via REST)', denied(r), why(r))

    // ================= ANON =================
    r = await as('anon', `INSERT INTO customer_tasks (customer_id, title, status, priority) VALUES ($1, '[SEC-B7 rollback-prøve]', 'pending', 'normal') RETURNING id`, [foreignCust.id])
    add('UÆNDRET', 'X1 anon kan ikke skrive opgaver (RLS)', denied(r), why(r))
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end().catch(() => {})
  }

  for (const k of out) console.log(`  ${k.kind === 'NOT_TESTABLE_PROD' ? 'NOT_TESTABLE_PROD' : k.ok ? 'PASS' : 'FAIL'}  ${k.kind === 'NOT_TESTABLE_PROD' ? '' : `[${k.kind}] `}${k.id} — ${k.note}`)
  const ny = out.filter((k) => k.kind === 'NY'), uae = out.filter((k) => k.kind === 'UÆNDRET')
  console.log(`  [NY] ${ny.filter((k) => k.ok).length}/${ny.length} · [UÆNDRET] ${uae.filter((k) => k.ok).length}/${uae.length} · transaktion rullet tilbage`)
  process.exitCode = out.some((k) => !k.ok) ? 2 : 0
}

main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
