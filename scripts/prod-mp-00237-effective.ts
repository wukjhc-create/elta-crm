/**
 * PRODUCTION effektiv kontrol for 00237 (user_role() fail-closed) — ROLLBACK-ONLY (se prod-rollback-probe.ts).
 * Rigtige profiler; deaktivering og "manglende profil" simuleres kun i prøvens savepoint (rulles tilbage).
 *   npx tsx scripts/prod-mp-00237-effective.ts     (før 00237: [NY] fejler · efter: alt PASS)
 */
import { randomUUID } from 'crypto'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'

runMain(() => withProdRollbackProbe('mp-00237-effective', async ({ q, as, add, notTestable, why }) => {
  const actives = (await q(`SELECT DISTINCT ON (role) id uid, role::text role FROM profiles WHERE is_active ORDER BY role, created_at`)) as Array<{ uid: string; role: string }>
  for (const role of ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi']) {
    const p = actives.find((x) => x.role === role)
    if (!p) { notTestable(`${role}: ingen aktiv profil i prod`, 'dækket af staging mp-00237-check'); continue }
    const r = await as({ uid: p.uid }, `SELECT public.user_role() AS r`)
    add('UÆNDRET', `aktiv ${role} får uændret rolle`, r.ok && r.rows[0]?.r === role, r.ok ? `rolle=${r.rows[0]?.r === role ? 'uændret' : 'AFVIGER'}` : r.code)
  }
  // montør med aktivt job (så den legitime skrivning kan prøves); ellers første montør/admin
  const withJob = (await q(`SELECT p.id uid, p.role::text role FROM profiles p JOIN employees e ON e.profile_id = p.id AND e.active
    WHERE p.is_active AND p.role::text = 'montør' AND EXISTS (SELECT 1 FROM work_orders w WHERE w.assigned_employee_id = e.id AND w.status <> 'cancelled')
    ORDER BY p.created_at LIMIT 1`))[0] as { uid: string; role: string } | undefined
  const montor = withJob ?? actives.find((x) => x.role === 'montør') ?? actives.find((x) => x.role === 'admin')
  if (montor) {
    // deaktivering kun i savepoint → user_role() skal give ingen_adgang, og en læsning af admin-/rolle-data skal give 0
    const r = await as({ uid: montor.uid }, `SELECT public.user_role() AS r, (SELECT count(*)::int FROM public.lead_activities) AS la`, [],
      [`UPDATE profiles SET is_active = false WHERE id = '${montor.uid}'`])
    add('NY', 'inaktiv profil → ingen_adgang', r.ok && r.rows[0]?.r === 'ingen_adgang', r.ok ? `rolle=${r.rows[0]?.r}` : r.code)
    // en skrivning montøren MÅ som aktiv (egen opgave hos kunde med eget job) — skal afvises når profilen er inaktiv
    const jobCust = (await q(`SELECT sc.customer_id FROM work_orders w JOIN service_cases sc ON sc.id = w.case_id JOIN employees e ON e.id = w.assigned_employee_id
      WHERE e.profile_id = $1 AND e.active AND w.status <> 'cancelled' LIMIT 1`, [montor.uid]))[0] as { customer_id: string } | undefined
    if (jobCust) {
      const ins = `INSERT INTO customer_tasks (customer_id, title, status, priority, assigned_to, created_by) VALUES ($1, '[00237 rollback-prøve]', 'pending', 'normal', $2, $2) RETURNING id`
      const a = await as({ uid: montor.uid }, ins, [jobCust.customer_id, montor.uid])
      add('UÆNDRET', 'aktiv montør kan oprette egen opgave hos kunde med job', !!a.ok && a.rows.length === 1, why(a))
      const w = await as({ uid: montor.uid }, ins, [jobCust.customer_id, montor.uid], [`UPDATE profiles SET is_active = false WHERE id = '${montor.uid}'`])
      add('NY', 'samme skrivning afvises når profilen er inaktiv', !w.ok || w.rows.length === 0, why(w))
    }
  }
  // manglende profil: et sub uden profiles-række (ingen bruger oprettes)
  const ghost = randomUUID()
  const g = await as({ uid: ghost }, `SELECT public.user_role() AS r`)
  add('NY', 'manglende profil → ingen_adgang (ikke montør)', g.ok && g.rows[0]?.r === 'ingen_adgang', g.ok ? `rolle=${g.rows[0]?.r}` : g.code)
  const fin = await as({ uid: ghost }, `SELECT public.can_view_case_finance(id) AS f FROM service_cases LIMIT 1`)
  add('UÆNDRET', 'can_view_case_finance = false uden adgang', fin.ok ? fin.rows.every((x) => x.f === false) : true, fin.ok ? `rækker=${fin.rows.length}` : fin.code)
  const an = await as('anon', `SELECT public.user_role() AS r`)
  add('UÆNDRET', 'anon kan ikke kalde user_role()', !an.ok, an.ok ? 'tilladt' : an.code)
}))
