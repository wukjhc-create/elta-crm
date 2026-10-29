/**
 * PRODUCTION effektiv kontrol af læse-scope 00240 / 00241 / 00242 — ROLLBACK-ONLY (prod-rollback-probe.ts). Trin-bevidst:
 * kun anvendte trin vurderes (politik-navnene afgør det). Rigtige profiler; ingen brugere oprettes; fixtures, overrides
 * og rolle-simulationer skrives kun i prøvens savepoint og ALT rulles tilbage. Kun etiketter og antal ud — ingen id'er.
 *   A  fixture-matrix pr. persona: admin, montør (med medarbejderrække), Elektriker-/Overmontør-skabelon, simuleret
 *      salg/serviceleder/bogholderi (= rollens standardrettigheder lagt på montør-profilen som overrides), inaktiv,
 *      manglende profil, anon
 *   B  skrive-grant rækker ikke ud over læse-scopet (Henrik 2026-10-29)
 *   C  rigtige data: rækketal pr. aktiv profil + lækage-invarianter (intet barn uden synlig forælder) + forventet
 *      kunde-/sagsantal beregnet uafhængigt af hjælpefunktionerne
 *   D  funktions-ACL, ingen bred fallback-politik, customer_notes håndteret som designet, ydelse (EXPLAIN ANALYZE)
 *   npx tsx scripts/prod-read-scope-effective.ts
 */
import { randomUUID } from 'crypto'
import { withProdRollbackProbe, runMain, type ProbeApi } from './prod-rollback-probe'
import { PERMISSION_TEMPLATES, templateOverrides } from '../src/lib/auth/permission-templates'

type Who = { uid: string } | 'anon'

runMain(() => withProdRollbackProbe('read-scope-effective', async ({ q, as, add, notTestable }: ProbeApi) => {
  const pol = async (t: string, n: string) => (await q(`SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND tablename=$1 AND policyname=$2`, [t, n]))[0].n === 1
  const s240 = await pol('customers', 'customers_select_scope')
  const s241 = await pol('customer_documents', 'customer_documents_select_scope')
  const s242 = await pol('invoices', 'invoices_select_scope')
  console.log(`  trin anvendt: 00240=${s240} 00241=${s241} 00242=${s242}`)
  if (!s240) throw new Error('00240 er ikke anvendt — intet at kontrollere')

  // værn: ingen trigger på fixture-tabellerne må kunne sende noget ud
  const TABLES = ['customers', 'service_cases', 'customer_contacts', 'customer_documents', 'roof_drawings', 'document_confirmations', 'work_orders',
    'customer_tasks', 'case_notes', 'case_materials', 'case_other_costs', 'service_case_attachments', 'invoices', 'invoice_lines', 'invoice_payments', 'user_permission_overrides']
  const outbound = (await q(`SELECT count(*)::int n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid::regclass::text = ANY($1) AND NOT t.tgisinternal
      AND (p.prosrc ILIKE '%net.http%' OR p.prosrc ILIKE '%http_post%' OR p.prosrc ILIKE '%http_get%')`, [TABLES]))[0].n
  if (outbound !== 0) throw new Error(`trigger med udgående kald fundet (${outbound}) — afbryder før prøver`)

  const actives = (await q(`SELECT p.id uid, p.role::text role,
      (SELECT e.id FROM employees e WHERE e.profile_id = p.id AND e.active ORDER BY e.created_at, e.id LIMIT 1) emp
    FROM profiles p WHERE p.is_active ORDER BY p.role, p.created_at`)) as Array<{ uid: string; role: string; emp: string | null }>
  const admin = actives.find((x) => x.role === 'admin')
  const montor = actives.find((x) => x.role === 'montør' && x.emp) ?? actives.find((x) => x.role === 'montør')
  if (!admin || !montor) throw new Error('mangler aktiv admin eller montør i prod')
  for (const role of ['serviceleder', 'salg', 'bogholderi']) {
    if (!actives.some((x) => x.role === role)) notTestable(`${role}: ingen aktiv profil i prod`, 'simuleret nedenfor (rollens standardrettigheder som overrides på montør-profilen) + staging-matricer')
  }

  // ---- fixtures (oprettes i hver prøves savepoint)
  const L = new Map<string, string>()
  const id = (label: string) => { const u = randomUUID(); L.set(u, label); return u }
  const tag = `ROLLBACK-SCOPE-${Date.now()}`
  const U = id('U'), R = id('R'), W = id('W'), CU = id('CU'), CR = id('CR'), CW = id('CW')
  const cU = id('cU'), cR = id('cR')
  const dCU = id('dCU'), dCR = id('dCR'), dR0 = id('dR0'), dU0 = id('dU0')
  const rCU = id('rCU'), rCR = id('rCR')
  const kCU = id('kCU'), kCR = id('kCR'), kR0 = id('kR0'), kU0 = id('kU0')
  const wCRown = id('wCRown'), wCRother = id('wCRother'), wCWown = id('wCWown')
  const tCU = id('tCU'), tCR = id('tCR')
  const nCU = id('nCU'), nCR = id('nCR'), mCU = id('mCU'), mCR = id('mCR'), oCU = id('oCU'), oCR = id('oCR'), aCU = id('aCU'), aCR = id('aCR')
  const iCU = id('iCU'), iCR = id('iCR'), i0 = id('i0'), lCU = id('lCU'), lCR = id('lCR'), pCU = id('pCU'), pCR = id('pCR')
  const emp = montor.emp
  const cust = (u: string, n: string) => `INSERT INTO public.customers (id, customer_number, company_name, contact_person, email, created_by) VALUES ('${u}', '${tag}-${n}', '[ROLLBACK] scope', 'R', '${tag.toLowerCase()}-${n}@rollback.invalid', '${admin.uid}')`
  const sc = (u: string, c: string, assigned: string | null) => `INSERT INTO public.service_cases (id, title, customer_id, created_by, assigned_to) VALUES ('${u}', '[ROLLBACK] scope', '${c}', '${admin.uid}', ${assigned ? `'${assigned}'` : 'NULL'})`
  const doc = (u: string, c: string, s: string | null) => `INSERT INTO public.customer_documents (id, customer_id, service_case_id, title, file_url, file_name, document_type) VALUES ('${u}', '${c}', ${s ? `'${s}'` : 'NULL'}, '[ROLLBACK] scope', '', 'rollback.pdf', 'other')`
  const conf = (u: string, d: string, s: string | null) => `INSERT INTO public.document_confirmations (id, customer_document_id, service_case_id, recipient_type, recipient_email, recipient_role, expires_at) VALUES ('${u}', '${d}', ${s ? `'${s}'` : 'NULL'}, 'manual', '${tag.toLowerCase()}@rollback.invalid', 'manual', now() + interval '1 day')`
  const wo = (u: string, s: string, c: string, e: string | null, status = 'planned') => `INSERT INTO public.work_orders (id, title, case_id, customer_id, assigned_employee_id, status) VALUES ('${u}', '[ROLLBACK] scope', '${s}', '${c}', ${e ? `'${e}'` : 'NULL'}, '${status}')`
  const seed = [
    cust(U, 'u'), cust(R, 'r'), cust(W, 'w'),
    sc(CU, U, null), sc(CR, R, montor.uid), sc(CW, W, null),
    `INSERT INTO public.customer_contacts (id, customer_id, name) VALUES ('${cU}', '${U}', '[ROLLBACK]'), ('${cR}', '${R}', '[ROLLBACK]')`,
    doc(dCU, U, CU), doc(dCR, R, CR), doc(dR0, R, null), doc(dU0, U, null),
    `INSERT INTO public.roof_drawings (id, customer_id, service_case_id, image_storage_path, image_width, image_height) VALUES ('${rCU}', '${U}', '${CU}', 'rollback/x.png', 1, 1), ('${rCR}', '${R}', '${CR}', 'rollback/y.png', 1, 1)`,
    conf(kCU, dCU, CU), conf(kCR, dCR, CR), conf(kR0, dR0, null), conf(kU0, dU0, null),
    `INSERT INTO public.customer_tasks (id, customer_id, service_case_id, title) VALUES ('${tCU}', '${U}', '${CU}', '[ROLLBACK]'), ('${tCR}', '${R}', '${CR}', '[ROLLBACK]')`,
    `INSERT INTO public.case_notes (id, case_id, content) VALUES ('${nCU}', '${CU}', '[ROLLBACK]'), ('${nCR}', '${CR}', '[ROLLBACK]')`,
    `INSERT INTO public.case_materials (id, case_id, description, quantity) VALUES ('${mCU}', '${CU}', '[ROLLBACK]', 1), ('${mCR}', '${CR}', '[ROLLBACK]', 1)`,
    `INSERT INTO public.case_other_costs (id, case_id, category, description) VALUES ('${oCU}', '${CU}', 'andet', '[ROLLBACK]'), ('${oCR}', '${CR}', 'andet', '[ROLLBACK]')`,
    `INSERT INTO public.service_case_attachments (id, service_case_id, file_name, file_url) VALUES ('${aCU}', '${CU}', 'rollback.png', ''), ('${aCR}', '${CR}', 'rollback.png', '')`,
    `INSERT INTO public.invoices (id, invoice_number, case_id, customer_id) VALUES ('${iCU}', '${tag}-iCU', '${CU}', '${U}'), ('${iCR}', '${tag}-iCR', '${CR}', '${R}'), ('${i0}', '${tag}-i0', NULL, '${R}')`,
    `INSERT INTO public.invoice_lines (id, invoice_id, description) VALUES ('${lCU}', '${iCU}', '[ROLLBACK]'), ('${lCR}', '${iCR}', '[ROLLBACK]')`,
    `INSERT INTO public.invoice_payments (id, invoice_id, amount) VALUES ('${pCU}', '${iCU}', 1), ('${pCR}', '${iCR}', 1)`,
    ...(emp ? [wo(wCRown, CR, R, emp), wo(wCRother, CR, R, null), wo(wCWown, CW, W, emp, 'cancelled')] : [wo(wCRother, CR, R, null)]),
  ]
  const ids = [...L.keys()]
  const VIS: Array<[string, string]> = [['customers', 'id'], ['service_cases', 'id'], ['customer_contacts', 'id'], ['customer_documents', 'id'], ['roof_drawings', 'id'],
    ['document_confirmations', 'id'], ['work_orders', 'id'], ['customer_tasks', 'id'], ['case_notes', 'id'], ['case_materials', 'id'], ['case_other_costs', 'id'],
    ['service_case_attachments', 'id'], ['invoices', 'id'], ['invoice_lines', 'id'], ['invoice_payments', 'id']]
  const visSql = VIS.map(([t]) => `SELECT '${t}' t, id::text FROM public.${t} WHERE id = ANY($1::uuid[])`).join(' UNION ALL ')
  const visible = async (who: Who, setup: string[] = []) => {
    const r = await as(who, visSql, [ids], [...seed, ...setup])
    if (!r.ok) return { err: r.code, set: new Set<string>() }
    return { err: null as string | null, set: new Set(r.rows.map((x: { id: string }) => L.get(x.id)!)) }
  }
  const grant = (uid: string, perm: string, effect: 'grant' | 'revoke' = 'grant', source = 'manual') =>
    `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ('${uid}', '${perm}', '${effect}', '${source}', 'rollback-prøve læse-scope')`
  const defaults = async (role: string) => ((await q(`SELECT permission FROM role_permission_defaults WHERE role::text = $1`, [role])) as Array<{ permission: string }>).map((x) => x.permission)
  const montorDefaults = await defaults('montør')
  const simulate = async (role: string) => {
    const d = await defaults(role)
    return [...d.filter((p) => !montorDefaults.includes(p)).map((p) => grant(montor.uid, p)), ...montorDefaults.filter((p) => !d.includes(p)).map((p) => grant(montor.uid, p, 'revoke'))]
  }
  const tpl = (k: 'elektriker' | 'overmontor') => templateOverrides(PERMISSION_TEMPLATES[k]).map((o) => grant(montor.uid, o.permission, o.effect, 'template'))

  // forventet synlighed pr. persona og trin (etiketter); ALL = alle fixtures i trinnets tabeller
  const STAGE: Record<string, 0 | 1 | 2> = { customers: 0, service_cases: 0, customer_contacts: 1, customer_documents: 1, roof_drawings: 1, document_confirmations: 1,
    work_orders: 2, customer_tasks: 2, case_notes: 2, case_materials: 2, case_other_costs: 2, service_case_attachments: 2, invoices: 2, invoice_lines: 2, invoice_payments: 2 }
  const TABLE_OF: Record<string, string> = {}
  for (const l of L.values()) {
    TABLE_OF[l] = l.startsWith('C') ? 'service_cases' : /^[URW]$/.test(l) ? 'customers' : ({ c: 'customer_contacts', d: 'customer_documents', r: 'roof_drawings', k: 'document_confirmations', w: 'work_orders', t: 'customer_tasks', n: 'case_notes', m: 'case_materials', o: 'case_other_costs', a: 'service_case_attachments', i: 'invoices', l: 'invoice_lines', p: 'invoice_payments' } as Record<string, string>)[l[0]]
  }
  const applied = (t: string) => [s240, s241, s242][STAGE[t]]
  const all = [...L.values()].filter((l) => emp || !['wCRown', 'wCWown'].includes(l))
  const check = async (persona: string, who: Who, expect: string[] | 'ALL', setup: string[] = [], kind: 'NY' | 'UÆNDRET' = 'NY') => {
    const v = await visible(who, setup)
    const exp = new Set(expect === 'ALL' ? all : expect.filter((l) => all.includes(l)))
    const tables = [...new Set(Object.values(TABLE_OF))].filter(applied)
    for (const t of tables) {
      const want = [...exp].filter((l) => TABLE_OF[l] === t).sort(), got = [...v.set].filter((l) => TABLE_OF[l] === t).sort()
      const ok = v.err === null ? JSON.stringify(want) === JSON.stringify(got) : who === 'anon' || want.length === 0
      add(kind, `${persona}: ${t}`, ok, v.err ? `fejl ${v.err}` : `ser [${got.join(',')}]${ok ? '' : ` forventet [${want.join(',')}]`}`)
    }
  }

  // ---- A: fixture-matrix
  console.log(`  A fixture-matrix (montør ${emp ? 'med' : 'UDEN'} medarbejderrække)`)
  await check('admin', { uid: admin.uid }, 'ALL', [], 'UÆNDRET')
  // montør: R via tildelt sag CR; U/W/CU/CW ude; kun egne arbejdsordrer (O1) — også en annulleret egen AO (wCWown), men den
  // giver ingen relation, så W/CW forbliver skjulte
  const montorSees = ['R', 'CR', 'cR', 'dCR', 'dR0', 'rCR', 'kCR', 'kR0', 'wCRown', 'wCWown', 'tCR', 'nCR', 'mCR', 'oCR', 'aCR']
  await check('montør', { uid: montor.uid }, montorSees)
  await check('Elektriker-skabelon', { uid: montor.uid }, montorSees, tpl('elektriker'))
  // Overmontør: customers/cases/work_orders.view.all → alle kunder/sager/AO og børn; ingen faktura-rettighed
  await check('Overmontør-skabelon', { uid: montor.uid }, all.filter((l) => !/^[ilp]/.test(l)), tpl('overmontor'))
  // simuleret salg (F1): alle kunder (customers.view.all), sager kun egne/relaterede (CR), fakturaer kun på sager i scope
  const salg = await simulate('salg')
  const salgDefaults = await defaults('salg')
  const salgDocU0 = salgDefaults.includes('customers.edit') || salgDefaults.includes('cases.view.all')
  // AO for salg følger politikken: egen medarbejderrække (simulationen bruger montør-profilen) hvis *.view.assigned;
  // ellers/også ordrer på sager i scope når work_orders.view.assigned mangler
  const salgOwnWo = salgDefaults.includes('work_orders.view.assigned') || salgDefaults.includes('cases.view.assigned')
  const salgCaseWo = !salgDefaults.includes('work_orders.view.assigned')
  await check('salg (simuleret)', { uid: montor.uid }, ['U', 'R', 'W', 'CR', 'cU', 'cR', 'dCR', 'dR0', ...(salgDocU0 ? ['dU0'] : []), 'rCR', 'kCR', 'kR0', ...(salgDocU0 ? ['kU0'] : []),
    ...(salgOwnWo || salgCaseWo ? ['wCRown'] : []), ...(salgCaseWo ? ['wCRother'] : []), ...(salgOwnWo ? ['wCWown'] : []), 'tCU', 'tCR', 'nCR', 'mCR', 'oCR', 'aCR', 'iCR', 'lCR', 'pCR'], salg)
  await check('serviceleder (simuleret)', { uid: montor.uid }, 'ALL', await simulate('serviceleder'))
  await check('bogholderi (simuleret)', { uid: montor.uid }, 'ALL', await simulate('bogholderi'))
  await check('inaktiv montør', { uid: montor.uid }, [], [`UPDATE public.profiles SET is_active = false WHERE id = '${montor.uid}'`])
  await check('inaktiv admin', { uid: admin.uid }, [], [`UPDATE public.profiles SET is_active = false WHERE id = '${admin.uid}'`])
  await check('manglende profil', { uid: randomUUID() }, [])
  await check('anon', 'anon', [], [], 'UÆNDRET')
  // relationer: åben opgave tildelt montøren gør kunden synlig (ikke sagen); lukket opgave gør ikke (D3)
  const ownTask = (status: string) => [`INSERT INTO public.customer_tasks (customer_id, title, assigned_to, status) VALUES ('${W}', '[ROLLBACK] egen', '${montor.uid}', '${status}')`]
  {
    const open = await visible({ uid: montor.uid }, ownTask('pending')), done = await visible({ uid: montor.uid }, ownTask('done'))
    add('NY', 'montør: åben opgave på kunde W → W synlig, CW ikke', open.set.has('W') && !open.set.has('CW'), `W=${open.set.has('W')} CW=${open.set.has('CW')}`)
    add('NY', 'montør: lukket opgave på kunde W → W ikke synlig', !done.set.has('W'), `W=${done.set.has('W')}`)
  }
  if (emp) {
    const act = await visible({ uid: montor.uid }, [`UPDATE public.work_orders SET status = 'planned' WHERE id = '${wCWown}'`])
    add('NY', 'montør: aktiv AO på sag CW → CW + W synlige', act.set.has('CW') && act.set.has('W'), `CW=${act.set.has('CW')} W=${act.set.has('W')}`)
    if (s242) {
      const ce = await as({ uid: montor.uid }, `SELECT public.current_employee_id() = '${emp}'::uuid ok`)
      add('NY', 'current_employee_id() = ældste aktive medarbejderrække', ce.ok && ce.rows[0]?.ok === true, ce.ok ? String(ce.rows[0]?.ok) : ce.code)
    }
  } else notTestable('montør med medarbejderrække', 'ingen aktiv montør med medarbejderrække — AO-prøver kun på staging')
  if (s242) {
    const fin = async (who: Who, setup: string[] = []) => {
      const r = await as(who, `SELECT public.can_view_case_finance('${CU}') u, public.can_view_case_finance('${CR}') r, public.can_view_case_finance(NULL) n`, [], [...seed, ...setup])
      return r.ok ? `${r.rows[0].u ? 1 : 0}${r.rows[0].r ? 1 : 0}${r.rows[0].n ? 1 : 0}` : r.code
    }
    // CU / CR / uden sag
    add('NY', 'can_view_case_finance: admin 111 (view.all)', (await fin({ uid: admin.uid })) === '111', await fin({ uid: admin.uid }))
    add('NY', 'can_view_case_finance: salg (sim.) 010 (kun sag i scope)', (await fin({ uid: montor.uid }, salg)) === '010', await fin({ uid: montor.uid }, salg))
    add('NY', 'can_view_case_finance: montør 000', (await fin({ uid: montor.uid })) === '000', await fin({ uid: montor.uid }))
    add('NY', 'can_view_case_finance: inaktiv admin 000', (await fin({ uid: admin.uid }, [`UPDATE public.profiles SET is_active = false WHERE id = '${admin.uid}'`])) === '000', 'fail-closed')
  }

  // ---- B: skrive-grant rækker ikke ud over læse-scopet
  const wg = ['customers.edit', 'customers.delete', 'cases.edit', 'cases.delete'].map((p) => grant(montor.uid, p))
  const n1 = async (sql: string) => { const r = await as({ uid: montor.uid }, sql, [], [...seed, ...wg]); return r.ok ? r.rows.length : -1 }
  add('NY', 'B montør + edit/delete-grants: UPDATE skjult kunde U = 0 rækker', (await n1(`UPDATE public.customers SET notes = 'x' WHERE id = '${U}' RETURNING id`)) === 0, 'skjult')
  add('NY', 'B … DELETE skjult kunde U = 0 rækker', (await n1(`DELETE FROM public.customers WHERE id = '${U}' RETURNING id`)) === 0, 'skjult')
  add('NY', 'B … UPDATE skjult sag CU = 0 rækker', (await n1(`UPDATE public.service_cases SET description = 'x' WHERE id = '${CU}' RETURNING id`)) === 0, 'skjult')
  add('NY', 'B … DELETE skjult sag CU = 0 rækker', (await n1(`DELETE FROM public.service_cases WHERE id = '${CU}' RETURNING id`)) === 0, 'skjult')
  add('NY', 'B … UPDATE relateret kunde R = 1 række', (await n1(`UPDATE public.customers SET notes = 'x' WHERE id = '${R}' RETURNING id`)) === 1, 'i scope')
  add('NY', 'B … UPDATE tildelt sag CR = 1 række', (await n1(`UPDATE public.service_cases SET description = 'x' WHERE id = '${CR}' RETURNING id`)) === 1, 'i scope')

  // ---- C: rigtige data — rækketal pr. aktiv profil + lækage-invarianter
  console.log('  C rigtige data (kun antal)')
  const REAL = VIS.map(([t]) => t).filter(applied)
  const totals = (await q(`SELECT ${REAL.map((t) => `(SELECT count(*)::int FROM public.${t}) "${t}"`).join(', ')}`))[0]
  console.log(`    total: ${REAL.map((t) => `${t}=${totals[t]}`).join(' ')}`)
  const leaks: Array<[string, string]> = [
    ['customers', 'SELECT 0'],
    ['service_cases', `SELECT count(*) FROM public.service_cases s WHERE s.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = s.customer_id)`],
    ['customer_contacts', `SELECT count(*) FROM public.customer_contacts x WHERE NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = x.customer_id)`],
    ['customer_documents', `SELECT count(*) FROM public.customer_documents x WHERE (x.service_case_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = x.service_case_id)) OR (x.service_case_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = x.customer_id))`],
    ['roof_drawings', `SELECT count(*) FROM public.roof_drawings x WHERE (x.service_case_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = x.service_case_id)) OR (x.service_case_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = x.customer_id))`],
    ['document_confirmations', `SELECT count(*) FROM public.document_confirmations x WHERE (x.service_case_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = x.service_case_id)) OR (x.service_case_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.customer_documents d WHERE d.id = x.customer_document_id))`],
    ['work_orders', 'SELECT 0'],
    ['customer_tasks', `SELECT count(*) FROM public.customer_tasks x WHERE x.assigned_to IS DISTINCT FROM auth.uid() AND x.created_by IS DISTINCT FROM auth.uid() AND NOT public.user_has_permission('customers.view.all') AND NOT (x.service_case_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = x.service_case_id))`],
    ...(['case_notes', 'case_materials', 'case_other_costs'].map((t) => [t, `SELECT count(*) FROM public.${t} x WHERE NOT EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = x.case_id)`]) as Array<[string, string]>),
    ['service_case_attachments', `SELECT count(*) FROM public.service_case_attachments x WHERE NOT EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = x.service_case_id)`],
    ['invoices', `SELECT count(*) FROM public.invoices x WHERE NOT public.user_has_permission('invoices.view.all') AND (x.case_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = x.case_id))`],
    ['invoice_lines', `SELECT count(*) FROM public.invoice_lines x WHERE NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = x.invoice_id)`],
    ['invoice_payments', `SELECT count(*) FROM public.invoice_payments x WHERE NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = x.invoice_id)`],
  ]
  for (const [n, p] of actives.entries()) {
    const persona = `${p.role}#${n + 1}${p.emp ? '' : ' (uden medarbejderrække)'}`
    const r = await as({ uid: p.uid }, `SELECT ${REAL.map((t) => `(SELECT count(*)::int FROM public.${t}) "${t}"`).join(', ')}`)
    if (!r.ok) { add('NY', `${persona}: rækketal`, false, r.code); continue }
    const c = r.rows[0]
    console.log(`    ${persona}: ${REAL.map((t) => `${t}=${c[t]}`).join(' ')}`)
    if (p.role === 'admin') add('UÆNDRET', `${persona}: ser alle rækker i alle scope-tabeller`, REAL.every((t) => c[t] === totals[t]), REAL.filter((t) => c[t] !== totals[t]).join(',') || 'alle = total')
    else {
      // uafhængig beregning (som postgres) af montørens forventede kunder/sager efter 00240-reglen
      const e = (await q(`WITH me AS (SELECT $1::uuid uid, (SELECT e.id FROM employees e WHERE e.profile_id = $1 AND e.active ORDER BY e.created_at, e.id LIMIT 1) emp),
        cs AS (SELECT s.id FROM service_cases s, me WHERE s.created_by = me.uid OR s.assigned_to = me.uid
               UNION SELECT w.case_id FROM work_orders w, me WHERE w.assigned_employee_id = me.emp AND w.status <> 'cancelled' AND w.case_id IS NOT NULL
               UNION SELECT s.id FROM service_cases s JOIN offers o ON o.id = s.source_offer_id, me WHERE o.created_by = me.uid),
        cu AS (SELECT c.id FROM customers c, me WHERE c.created_by = me.uid
               UNION SELECT unnest(ARRAY[s.customer_id, s.site_customer_id, s.payer_customer_id, s.orderer_customer_id, s.end_customer_id, s.purchased_from_customer_id]) FROM service_cases s WHERE s.id IN (SELECT id FROM cs)
               UNION SELECT w.customer_id FROM work_orders w, me WHERE w.assigned_employee_id = me.emp AND w.status <> 'cancelled'
               UNION SELECT t.customer_id FROM customer_tasks t, me WHERE t.assigned_to = me.uid AND t.status IN ('pending', 'in_progress'))
        SELECT (SELECT count(*)::int FROM cs WHERE id IS NOT NULL) cases, (SELECT count(*)::int FROM cu WHERE id IS NOT NULL) customers`, [p.uid]))[0]
      add('NY', `${persona}: kunder/sager = uafhængigt beregnet scope`, c.customers === e.customers && c.service_cases === e.cases, `kunder ${c.customers}/${e.customers} sager ${c.service_cases}/${e.cases}`)
      const lk = await as({ uid: p.uid }, `SELECT ${leaks.filter(([t]) => applied(t)).map(([t, s]) => `(${s})::int "${t}"`).join(', ')}`)
      const bad = lk.ok ? Object.entries(lk.rows[0]).filter(([, v]) => Number(v) !== 0).map(([k, v]) => `${k}=${v}`) : [lk.code]
      add('NY', `${persona}: ingen barnerække uden synlig forælder (lækage)`, bad.length === 0, bad.join(',') || '0 i alle tabeller')
      if (s242) {
        const wo = await as({ uid: p.uid }, `SELECT count(*)::int n FROM public.work_orders WHERE assigned_employee_id IS DISTINCT FROM public.current_employee_id()`)
        add('NY', `${persona}: kun egne arbejdsordrer (O1)`, wo.ok && wo.rows[0].n === 0, wo.ok ? `fremmede=${wo.rows[0].n}` : wo.code)
      }
    }
  }

  // ---- D: ACL, ingen bred fallback, customer_notes, ydelse
  const fns = ['my_case_scope_ids()', 'my_customer_scope_ids()', ...(s241 ? ['my_case_customer_ids()'] : []), ...(s242 ? ['can_view_case_finance(uuid)', 'current_employee_id()'] : [])]
  for (const f of fns) {
    const a = (await q(`SELECT coalesce(array_to_string(proacl, ','), '') acl FROM pg_proc WHERE oid = to_regprocedure('public.${f}')`))[0]?.acl ?? ''
    add('NY', `ACL ${f}: authenticated ja, anon/PUBLIC nej`, a.includes('authenticated=X') && !a.includes('anon=') && !/(^|,)=X/.test(a), a.replace(/=X\/\w+/g, '=X'))
  }
  const scopeTables = VIS.map(([t]) => t).filter(applied)
  const broad = (await q(`SELECT tablename || '.' || policyname p FROM pg_policies WHERE schemaname='public' AND tablename = ANY($1) AND cmd IN ('SELECT','ALL')
      AND ('authenticated' = ANY (roles) OR 'public' = ANY (roles) OR 'anon' = ANY (roles)) AND (qual IS NULL OR qual = 'true')`, [scopeTables])) as Array<{ p: string }>
  add('NY', 'ingen bred SELECT/ALL-politik (qual true) på scope-tabellerne', broad.length === 0, broad.map((x) => x.p).join(',') || 'ingen')
  if (s241) {
    const cn = (await q(`SELECT to_regclass('public.customer_notes') IS NULL absent, (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename='customer_notes') pols`))[0]
    add('NY', 'customer_notes findes ikke i prod → ingen politik oprettet (som designet)', cn.absent === true && cn.pols === 0, `absent=${cn.absent} politikker=${cn.pols}`)
  }
  const perf = async (who: Who, t: string) => {
    const r = await as(who, `EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM public.${t}`)
    return r.ok ? Number(r.rows[0]['QUERY PLAN'][0]['Execution Time']).toFixed(1) : r.code
  }
  for (const t of scopeTables) console.log(`    ydelse count(*) ${t}: admin ${await perf({ uid: admin.uid }, t)} ms · montør ${await perf({ uid: montor.uid }, t)} ms`)
}))
