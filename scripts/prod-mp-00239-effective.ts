/**
 * PRODUCTION effektiv kontrol for 00239 (revideret) — ROLLBACK-ONLY (se prod-rollback-probe.ts). Rigtige profiler;
 * ingen brugere oprettes; overrides og testrækker skrives kun i prøvens savepoint og ALT rulles tilbage.
 *   admin: eksisterende skriveadgang uændret (kunde/sag INSERT/UPDATE/DELETE, slet forslag)
 *   montør: baseline nægtet · grant customers.create → kunde-INSERT · fjernet grant → nægtet · grant cases.create → kun
 *           sags-INSERT (ikke UPDATE/DELETE) · offers.create / inbox.view alene → ingen kunde-INSERT · Elektriker-skabelon
 *   inaktiv og manglende profil nægtet · SELECT uændret · anon nægtet
 *   npx tsx scripts/prod-mp-00239-effective.ts
 */
import { randomUUID } from 'crypto'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'
import { PERMISSION_TEMPLATES, templateOverrides } from '../src/lib/auth/permission-templates'

runMain(() => withProdRollbackProbe('mp-00239-effective', async ({ q, as, add, notTestable, allowed1, denied, why }) => {
  // værn: ingen trigger på tabellerne må kunne sende noget ud (http/pg_net) — så er rollback-prøverne uden sideeffekter
  const outbound = (await q(`SELECT count(*)::int n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid IN ('public.customers'::regclass, 'public.service_cases'::regclass) AND NOT t.tgisinternal
      AND (p.prosrc ILIKE '%net.http%' OR p.prosrc ILIKE '%http_post%' OR p.prosrc ILIKE '%http_get%')`))[0].n
  if (outbound !== 0) throw new Error(`trigger med udgående kald fundet (${outbound}) — afbryder før prøver`)

  const actives = (await q(`SELECT DISTINCT ON (role) id uid, role::text role FROM profiles WHERE is_active ORDER BY role, created_at`)) as Array<{ uid: string; role: string }>
  const admin = actives.find((x) => x.role === 'admin')
  const montor = actives.find((x) => x.role === 'montør')
  if (!admin || !montor) throw new Error('mangler aktiv admin eller montør i prod')
  for (const role of ['serviceleder', 'salg', 'bogholderi']) {
    if (!actives.some((x) => x.role === role)) notTestable(`${role}: ingen aktiv profil i prod`, 'dækket af staging mp-00239-rls-check 51/51 + U230')
  }

  // testrækker (som ejer, i prøvens savepoint) — faste id'er pr. kørsel. Sag + forslag er tildelt montøren, så rækkerne
  // ligger i hans læse-scope (00240): et NÆGTET skyldes rettigheden, ikke synligheden (scope-prøver: prod-read-scope-effective.ts)
  const tag = `ROLLBACK-239-${Date.now()}`
  const cust = randomUUID(), caseId = randomUUID(), propId = randomUUID()
  const seed = [
    `INSERT INTO public.customers (id, customer_number, company_name, contact_person, email, created_by) VALUES ('${cust}', '${tag}', '[ROLLBACK] 239', 'R', '${tag.toLowerCase()}@rollback.invalid', '${admin.uid}')`,
    `INSERT INTO public.service_cases (id, title, customer_id, created_by, is_proposal, assigned_to) VALUES ('${caseId}', '[ROLLBACK] 239 sag', '${cust}', '${admin.uid}', false, '${montor.uid}')`,
    `INSERT INTO public.service_cases (id, title, customer_id, created_by, is_proposal, assigned_to) VALUES ('${propId}', '[ROLLBACK] 239 forslag', '${cust}', '${admin.uid}', true, '${montor.uid}')`,
  ]
  const grant = (uid: string, perm: string, source = 'manual') =>
    `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ('${uid}', '${perm}', 'grant', '${source}', 'rollback-prøve 00239')`
  let k = 0
  const insCust = (uid: string) => `INSERT INTO public.customers (customer_number, company_name, contact_person, email, created_by) VALUES ('${tag}-${++k}', '[ROLLBACK] 239', 'R', '${tag.toLowerCase()}-${k}@rollback.invalid', '${uid}') RETURNING id`
  const insCase = (uid: string) => `INSERT INTO public.service_cases (title, customer_id, created_by) VALUES ('[ROLLBACK] 239 ny', '${cust}', '${uid}') RETURNING id`
  const updCust = `UPDATE public.customers SET notes = '[ROLLBACK] 239' WHERE id = '${cust}' RETURNING id`
  const delCust = `DELETE FROM public.customers WHERE id = '${cust}' RETURNING id`
  const updCase = `UPDATE public.service_cases SET description = '[ROLLBACK] 239' WHERE id = '${caseId}' RETURNING id`
  const delCase = `DELETE FROM public.service_cases WHERE id = '${caseId}' RETURNING id`
  const delProp = `DELETE FROM public.service_cases WHERE id = '${propId}' RETURNING id`
  const run = (uid: string, sql: string, setup: string[] = []) => as({ uid }, sql, [], [...seed, ...setup])

  // ---- admin: uændret
  const adm: Array<[string, string]> = [['kunde INSERT', insCust(admin.uid)], ['kunde UPDATE', updCust], ['kunde DELETE', delCust], ['sag INSERT', insCase(admin.uid)], ['sag UPDATE', updCase], ['sag DELETE', delCase], ['forslag DELETE', delProp]]
  for (const [label, sql] of adm) { const r = await run(admin.uid, sql); add('UÆNDRET', `admin: ${label} tilladt`, allowed1(r), why(r)) }

  // ---- montør baseline
  const base: Array<[string, string]> = [['kunde INSERT', insCust(montor.uid)], ['kunde UPDATE', updCust], ['kunde DELETE', delCust], ['sag INSERT', insCase(montor.uid)], ['sag UPDATE', updCase], ['sag DELETE', delCase], ['forslag DELETE', delProp]]
  for (const [label, sql] of base) {
    const r = await run(montor.uid, sql)
    add(label.endsWith('INSERT') ? 'NY' : 'UÆNDRET', `montør baseline: ${label} NÆGTET`, denied(r), why(r))
  }

  // ---- montør: customers.create
  let r = await run(montor.uid, insCust(montor.uid), [grant(montor.uid, 'customers.create')])
  add('NY', 'montør + grant customers.create: kunde INSERT TILLADT', allowed1(r), why(r))
  r = await run(montor.uid, insCust(montor.uid), [grant(montor.uid, 'customers.create'), `DELETE FROM public.user_permission_overrides WHERE profile_id = '${montor.uid}' AND permission = 'customers.create'`])
  add('NY', 'montør, grant fjernet igen: kunde INSERT NÆGTET', denied(r), why(r))
  r = await run(montor.uid, insCust(montor.uid), [grant(montor.uid, 'offers.create')])
  add('NY', 'montør + grant offers.create alene: kunde INSERT NÆGTET', denied(r), why(r))
  r = await run(montor.uid, insCust(montor.uid), [grant(montor.uid, 'inbox.view')])
  add('NY', 'montør + grant inbox.view alene: kunde INSERT NÆGTET', denied(r), why(r))

  // ---- montør: cases.create = kun opret
  const gc = [grant(montor.uid, 'cases.create')]
  r = await run(montor.uid, insCase(montor.uid), gc)
  add('NY', 'montør + grant cases.create: sag INSERT TILLADT', allowed1(r), why(r))
  r = await run(montor.uid, insCase(montor.uid), [...gc, `DELETE FROM public.user_permission_overrides WHERE profile_id = '${montor.uid}' AND permission = 'cases.create'`])
  add('NY', 'montør, cases.create fjernet igen: sag INSERT NÆGTET', denied(r), why(r))
  for (const [label, sql] of [['sag UPDATE', updCase], ['sag DELETE', delCase], ['forslag DELETE', delProp], ['kunde INSERT', insCust(montor.uid)]] as Array<[string, string]>) {
    r = await run(montor.uid, sql, gc)
    add('NY', `montør + grant cases.create: ${label} stadig NÆGTET`, denied(r), why(r))
  }

  // ---- Elektriker-skabelon
  const el = templateOverrides(PERMISSION_TEMPLATES.elektriker).map((o) => (o.effect === 'grant' ? grant(montor.uid, o.permission, 'template') : `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ('${montor.uid}', '${o.permission}', 'revoke', 'template', 'rollback-prøve 00239')`))
  r = await run(montor.uid, insCust(montor.uid), el); add('NY', 'montør + Elektriker-skabelon: kunde INSERT TILLADT', allowed1(r), why(r))
  r = await run(montor.uid, insCase(montor.uid), el); add('NY', 'montør + Elektriker-skabelon: sag INSERT TILLADT', allowed1(r), why(r))
  r = await run(montor.uid, updCase, el); add('NY', 'montør + Elektriker-skabelon: sag UPDATE NÆGTET', denied(r), why(r))
  r = await run(montor.uid, delProp, el); add('NY', 'montør + Elektriker-skabelon: forslag DELETE NÆGTET', denied(r), why(r))

  // ---- inaktiv / manglende profil / anon
  const inactive = [grant(montor.uid, 'customers.create'), grant(montor.uid, 'cases.create'), `UPDATE public.profiles SET is_active = false WHERE id = '${montor.uid}'`]
  r = await run(montor.uid, insCust(montor.uid), inactive); add('UÆNDRET', 'inaktiv montør (med grants): kunde INSERT NÆGTET', denied(r), why(r))
  r = await run(montor.uid, insCase(montor.uid), inactive); add('UÆNDRET', 'inaktiv montør (med grants): sag INSERT NÆGTET', denied(r), why(r))
  const ghost = randomUUID()
  r = await run(ghost, insCust(ghost)); add('UÆNDRET', 'manglende profil: kunde INSERT NÆGTET', denied(r), why(r))
  r = await run(ghost, insCase(ghost)); add('UÆNDRET', 'manglende profil: sag INSERT NÆGTET', denied(r), why(r))
  r = await as('anon', insCust(admin.uid), [], seed); add('UÆNDRET', 'anon: kunde INSERT NÆGTET', denied(r), why(r))

  // ---- SELECT uændret
  for (const p of [admin, montor]) {
    const c1 = await run(p.uid, `SELECT id FROM public.customers WHERE id = '${cust}'`)
    const c2 = await run(p.uid, `SELECT id FROM public.service_cases WHERE id = '${caseId}'`)
    add('UÆNDRET', `${p.role}: SELECT kunde + sag uændret`, allowed1(c1) && allowed1(c2), `${why(c1)} / ${why(c2)}`)
  }
}))
