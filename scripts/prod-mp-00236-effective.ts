/**
 * PRODUCTION effektiv kontrol for 00236 — ROLLBACK-ONLY (se prod-rollback-probe.ts). Rigtige profiler (montør med job +
 * admin); salg/bogholderi uden profil i prod → NOT_TESTABLE_PROD (dækket af staging mp-00236-rls-check).
 *   npx tsx scripts/prod-mp-00236-effective.ts     (før 00236: [NY] fejler · efter: alt PASS)
 */
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'

runMain(() => withProdRollbackProbe('mp-00236-effective', async ({ q, as, add, notTestable, allowed1, denied, why }) => {
  const montor = (await q(`SELECT p.id uid, e.id emp FROM profiles p JOIN employees e ON e.profile_id = p.id AND e.active
    WHERE p.is_active AND p.role::text = 'montør' AND EXISTS (SELECT 1 FROM work_orders w WHERE w.assigned_employee_id = e.id AND w.status <> 'cancelled')
    ORDER BY p.created_at LIMIT 1`))[0] as { uid: string; emp: string } | undefined
  const admin = (await q(`SELECT id uid FROM profiles WHERE is_active AND role::text = 'admin' ORDER BY created_at LIMIT 1`))[0] as { uid: string } | undefined
  if (!montor || !admin) throw new Error('mangler montør med job eller admin i prod')
  for (const role of ['salg', 'bogholderi', 'serviceleder']) {
    const n = (await q(`SELECT count(*)::int n FROM profiles WHERE is_active AND role::text = $1`, [role]))[0].n
    if (!n) notTestable(`${role}: ingen aktiv profil i prod`, 'dækket af staging mp-00236-rls-check')
  }
  const wo = (await q(`SELECT w.case_id, sc.customer_id FROM work_orders w JOIN service_cases sc ON sc.id = w.case_id
    WHERE w.assigned_employee_id = $1 AND w.status <> 'cancelled' ORDER BY w.created_at LIMIT 1`, [montor.emp]))[0] as { case_id: string; customer_id: string }
  const M = { uid: montor.uid }, A = { uid: admin.uid }
  const T = `'[00236 rollback-prøve]'`
  const seedTask = (createdBy: string, assignedTo: string, caseId: string | null, auto = false) =>
    `INSERT INTO customer_tasks (customer_id, service_case_id, title, status, priority, assigned_to, created_by, auto_generated, auto_rule)
     VALUES ('${wo.customer_id}', ${caseId ? `'${caseId}'` : 'NULL'}, ${T}, 'pending', 'normal', '${assignedTo}', '${createdBy}', ${auto}, ${auto ? `'rollback_probe'` : 'NULL'})`
  const delMine = `DELETE FROM customer_tasks WHERE title = ${T} RETURNING id`

  // ---- opgave-sletning
  let r = await as(M, delMine, [], [seedTask(montor.uid, montor.uid, wo.case_id)])
  add('UÆNDRET', 'D-a montør sletter egen+tildelt opgave på egen sag', allowed1(r), why(r))
  r = await as(M, delMine, [], [seedTask(montor.uid, montor.uid, null)])
  add('NY', 'D-b montør kan ikke slette egen opgave uden sag', denied(r), why(r))
  r = await as(M, delMine, [], [seedTask(admin.uid, montor.uid, wo.case_id)])
  add('NY', 'D-c montør kan ikke slette en opgave kontoret har oprettet', denied(r), why(r))
  r = await as(M, delMine, [], [seedTask(montor.uid, montor.uid, wo.case_id, true)])
  add('NY', 'D-d montør kan ikke slette en systemopgave', denied(r), why(r))
  r = await as(A, delMine, [], [seedTask(montor.uid, montor.uid, null, true)])
  add('UÆNDRET', 'D-e admin sletter enhver opgave (inkl. system)', allowed1(r), why(r))

  // ---- tagtegninger på lukket sag (sagen lukkes kun i prøvens savepoint)
  const D = `'[00236 rollback-prøve]'`
  const seedDrawing = `INSERT INTO roof_drawings (customer_id, service_case_id, title, image_storage_path, image_width, image_height, panel_count, drawing_data, created_by)
    VALUES ('${wo.customer_id}', '${wo.case_id}', ${D}, 'roof-drawings/rollback/none.png', 1, 1, 0, '{"panels":[]}', '${admin.uid}')`
  const closeCase = `UPDATE service_cases SET status = 'closed' WHERE id = '${wo.case_id}'`
  r = await as(A, `INSERT INTO roof_drawings (customer_id, service_case_id, title, image_storage_path, image_width, image_height, panel_count, drawing_data, created_by)
    VALUES ($1, $2, ${D}, 'roof-drawings/rollback/none.png', 1, 1, 0, '{"panels":[]}', $3) RETURNING id`, [wo.customer_id, wo.case_id, admin.uid], [closeCase])
  add('NY', 'R-a admin kan ikke tegne på lukket sag', denied(r), why(r))
  r = await as(A, `UPDATE roof_drawings SET panel_count = 3 WHERE title = ${D} RETURNING id`, [], [seedDrawing, closeCase])
  add('NY', 'R-b tegning på lukket sag kan ikke ændres', denied(r), why(r))
  r = await as(A, `DELETE FROM roof_drawings WHERE title = ${D} RETURNING id`, [], [seedDrawing, closeCase])
  add('NY', 'R-c tegning på lukket sag kan ikke slettes', denied(r), why(r))
  r = await as(M, `INSERT INTO roof_drawings (customer_id, service_case_id, title, image_storage_path, image_width, image_height, panel_count, drawing_data, created_by)
    VALUES ($1, $2, ${D}, 'roof-drawings/rollback/none.png', 1, 1, 0, '{"panels":[]}', $3) RETURNING id`, [wo.customer_id, wo.case_id, montor.uid])
  add('UÆNDRET', 'R-d montør tegner stadig på åben egen sag', allowed1(r), why(r))
  r = await as(A, `INSERT INTO roof_drawings (customer_id, service_case_id, title, image_storage_path, image_width, image_height, panel_count, drawing_data, created_by)
    VALUES ($1, NULL, ${D}, 'roof-drawings/rollback/none.png', 1, 1, 0, '{"panels":[]}', $2) RETURNING id`, [wo.customer_id, admin.uid])
  add('UÆNDRET', 'R-e admin tegner stadig uden sag', allowed1(r), why(r))
}))
