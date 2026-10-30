/**
 * PRODUCTION effektiv kontrol for 00243 (time_logs via effektive rettigheder) — ROLLBACK-ONLY (prod-rollback-probe.ts).
 * ÉN transaktion, rulles ALTID tilbage: fixtures (kunde, sager, arbejdsordrer, kollega-medarbejder, timer) → måling med
 * de AKTUELT installerede funktioner → de GAMLE (00161) installeres og måles → 00243-migrationens krop køres og måles.
 * Samme script er pre-check (før apply: aktuel == gammel) og post-check (efter apply: aktuel == ny).
 *   Personas: rigtige prod-profiler. Prod har kun aktive admin + montør → serviceleder/bogholderi/salg SIMULERES ved at
 *   give eksisterende profiler rollen i transaktionen (rulles tilbage; ingen brugere oprettes)
 *   Overrides: grant virker, revoke virker, fjernet override = rollestandard igen; Elektriker/Overmontør-skabeloner
 *   Kost/løn (cost_amount, cost_rate_snapshot) og approval_status: 42501 for alle brugersessioner
 *   Kun labels/antal ud — ingen id'er, navne eller indhold.
 *   npx tsx scripts/prod-mp-00243-effective.ts
 */
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'
import { PERMISSION_TEMPLATES, templateOverrides } from '../src/lib/auth/permission-templates'
import { oldTimeLogFunctions } from './test-harness/mp-00243-sql-probe'

const ROWS = ['tl_m_own', 'tl_col_on_mine', 'tl_m_on_col', 'tl_col_other', 'tl_col_d4', 'tl_col_salgown'] as const
const WRITES = ['w_m_mine', 'w_m_col', 'w_col_mine', 'w_col_col'] as const

/** Krop af den committede migration (mellem BEGIN; og NOTIFY) — præcis det der anvendes i prod */
function migrationBody(): string {
  const sql = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '00243_time_logs_effective_permissions.sql'), 'utf8').replace(/\r\n/g, '\n')
  const a = sql.indexOf('\nBEGIN;\n'), b = sql.indexOf("\nNOTIFY pgrst, 'reload schema';")
  if (a < 0 || b < a) throw new Error('00243: har ikke BEGIN; … NOTIFY')
  const body = sql.slice(a + '\nBEGIN;\n'.length, b)
  if (/\b(COMMIT|ROLLBACK)\b/i.test(body.replace(/--.*$/gm, ''))) throw new Error('00243: transaktionskontrol i kroppen')
  return body
}

runMain(() => withProdRollbackProbe('mp-00243-effective', async ({ q, add, notTestable }) => {
  const outbound = (await q(`SELECT count(*)::int n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid IN ('public.time_logs'::regclass, 'public.work_orders'::regclass, 'public.service_cases'::regclass, 'public.customers'::regclass,
      'public.employees'::regclass, 'public.profiles'::regclass, 'public.user_permission_overrides'::regclass) AND NOT t.tgisinternal
      AND (p.prosrc ILIKE '%net.http%' OR p.prosrc ILIKE '%http_post%' OR p.prosrc ILIKE '%http_get%')`))[0].n
  if (outbound !== 0) throw new Error(`trigger med udgående kald fundet (${outbound}) — afbryder før prøver`)

  const fn = (await q(`SELECT proname, md5(prosrc) h, md5(replace(prosrc, chr(13), '')) h_lf, prosecdef, coalesce(array_to_string(proacl, ','), '') acl, prosrc LIKE '%user_has_permission%' is243
    FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('can_view_time_log', 'can_write_time_log') ORDER BY proname`)) as Array<{ proname: string; h: string; h_lf: string; prosecdef: boolean; acl: string; is243: boolean }>
  const applied = fn.length === 2 && fn.every((f) => f.is243)
  for (const f of fn) add('UÆNDRET', `tilstand ${f.proname}: ${f.is243 ? '00243' : '00161'}`, true, `md5=${f.h} (lf ${f.h_lf}) secdef=${f.prosecdef} acl=${f.acl}`)

  const actives = (await q(`SELECT p.id uid, p.role::text role, (SELECT e.id FROM employees e WHERE e.profile_id = p.id AND e.active LIMIT 1) emp
    FROM profiles p WHERE p.is_active ORDER BY p.created_at`)) as Array<{ uid: string; role: string; emp: string | null }>
  const admin = actives.find((x) => x.role === 'admin')
  const montor = actives.find((x) => x.role === 'montør' && x.emp)
  if (!admin || !montor) throw new Error('mangler aktiv admin eller montør med medarbejderrække i prod')
  const spare = actives.filter((x) => x.uid !== admin.uid && x.uid !== montor.uid)
  if (spare.length < 3) throw new Error(`for få profiler til at simulere serviceleder/bogholderi/salg (${spare.length})`)
  const sim = { serviceleder: spare[0].uid, bogholderi: spare[1].uid, salg: spare[2].uid }
  for (const r of ['serviceleder', 'bogholderi', 'salg']) notTestable(`${r}: ingen aktiv profil i prod`, 'SIMULERET: eksisterende profil får rollen i transaktionen (rulles tilbage)')

  const L: Record<string, string> = {}
  const id = (k: string) => (L[k] ??= randomUUID())
  const tag = `ROLLBACK-243-${Date.now()}`
  const setup: string[] = [
    `UPDATE public.profiles SET role = 'serviceleder' WHERE id = '${sim.serviceleder}'`,
    `UPDATE public.profiles SET role = 'bogholderi' WHERE id = '${sim.bogholderi}'`,
    `UPDATE public.profiles SET role = 'salg' WHERE id = '${sim.salg}'`,
    `DELETE FROM public.user_permission_overrides WHERE profile_id IN ('${montor.uid}', '${sim.serviceleder}', '${sim.bogholderi}', '${sim.salg}', '${admin.uid}')`,
    `INSERT INTO public.customers (id, customer_number, company_name, contact_person, email, created_by) VALUES ('${id('cust')}', '${tag}', '[ROLLBACK] 243', 'R', '${tag.toLowerCase()}@rollback.invalid', '${admin.uid}')`,
    `INSERT INTO public.employees (id, name, email, role, active, hourly_rate, cost_rate) VALUES ('${id('e_col')}', '[ROLLBACK] 243 kollega', '${tag.toLowerCase()}-col@rollback.invalid', 'montør', true, 495, 300)`,
  ]
  const cs = (k: string, createdBy: string, assignedTo: string | null) =>
    setup.push(`INSERT INTO public.service_cases (id, title, customer_id, created_by, assigned_to) VALUES ('${id(k)}', '[ROLLBACK] 243', '${L.cust}', '${createdBy}', ${assignedTo ? `'${assignedTo}'` : 'NULL'})`)
  cs('case_mine', admin.uid, null)
  cs('case_hidden', admin.uid, null)
  cs('case_d4', admin.uid, sim.salg) // tildelt salg, ikke oprettet af salg → 00161 viser IKKE timerne (ingen F1-udvidelse)
  cs('case_salgown', sim.salg, null)
  const wo = (k: string, c: string, emp: string) =>
    setup.push(`INSERT INTO public.work_orders (id, case_id, customer_id, title, status, scheduled_date, assigned_employee_id) VALUES ('${id(k)}', '${L[c]}', '${L.cust}', '[ROLLBACK] 243', 'planned', '2026-09-01', '${emp}')`)
  wo('wo_mine', 'case_mine', montor.emp!)
  wo('wo_col', 'case_hidden', L.e_col)
  wo('wo_col_d4', 'case_d4', L.e_col)
  wo('wo_col_salgown', 'case_salgown', L.e_col)
  const tl = (k: string, emp: string, w: string, h: number) =>
    setup.push(`INSERT INTO public.time_logs (id, employee_id, work_order_id, start_time, end_time, description) VALUES ('${id(k)}', '${emp}', '${L[w]}', '2026-09-01 ${String(h).padStart(2, '0')}:00+00', '2026-09-01 ${String(h + 1).padStart(2, '0')}:00+00', '[ROLLBACK] 243')`)
  tl('tl_m_own', montor.emp!, 'wo_mine', 4)
  tl('tl_m_on_col', montor.emp!, 'wo_col', 6)
  tl('tl_col_on_mine', L.e_col, 'wo_mine', 4)
  tl('tl_col_other', L.e_col, 'wo_col', 6)
  tl('tl_col_d4', L.e_col, 'wo_col_d4', 8)
  tl('tl_col_salgown', L.e_col, 'wo_col_salgown', 10)
  for (const s of setup) await q(s)

  const label = new Map(Object.entries(L).map(([k, v]) => [v, k]))
  const idArr = `ARRAY[${ROWS.map((k) => `'${L[k]}'::uuid`).join(',')}]`
  const writeSql = [
    `'w_m_mine', public.can_write_time_log('${montor.emp}', '${L.wo_mine}')`,
    `'w_m_col', public.can_write_time_log('${montor.emp}', '${L.wo_col}')`,
    `'w_col_mine', public.can_write_time_log('${L.e_col}', '${L.wo_mine}')`,
    `'w_col_col', public.can_write_time_log('${L.e_col}', '${L.wo_col}')`,
  ].join(', ')
  await q(`CREATE FUNCTION pg_temp.p243(p_uid uuid, p_anon boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $f$
  DECLARE r jsonb := '{}'::jsonb; v jsonb; w jsonb;
  BEGIN
    IF p_anon THEN
      EXECUTE 'SET LOCAL ROLE anon';
      PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    ELSE
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    END IF;
    BEGIN
      EXECUTE 'SELECT coalesce(jsonb_agg(x.id), ''[]'') FROM public.time_logs x WHERE x.id = ANY (${idArr.replace(/'/g, "''")})' INTO v;
      r := r || jsonb_build_object('vis', v);
    EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('vis', '[]'::jsonb, 'vis_denied', SQLSTATE);
    END;
    BEGIN
      -- dynamisk SQL: en cachet plpgsql-udtrykstilstand ville springe EXECUTE-rettighedstjekket over for næste persona
      EXECUTE 'SELECT jsonb_build_object(${writeSql.replace(/'/g, "''")})' INTO w;
      r := r || jsonb_build_object('w', w);
    EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('w', '{}'::jsonb, 'w_denied', SQLSTATE);
    END;
    BEGIN
      EXECUTE 'SELECT count(cost_amount) FROM public.time_logs';
      r := r || jsonb_build_object('cost', 'LÆSBAR');
    EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('cost', SQLSTATE);
    END;
    BEGIN
      EXECUTE 'SELECT count(cost_rate_snapshot) FROM public.time_logs';
      r := r || jsonb_build_object('cost_rate', 'LÆSBAR');
    EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('cost_rate', SQLSTATE);
    END;
    BEGIN
      EXECUTE format('UPDATE public.time_logs SET approval_status = %L WHERE id = %L', 'approved', '${L.tl_m_own}');
      r := r || jsonb_build_object('approve', 'TILLADT');
    EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('approve', SQLSTATE);
    END;
    EXECUTE 'RESET ROLE';
    RETURN r;
  END $f$`)
  type Cell = { vis: string[]; w: Record<string, boolean>; cost: string; cost_rate: string; approve: string }
  const m = async (uid: string | null, anon = false): Promise<Cell> => {
    await q('SAVEPOINT m243')
    try { return (await q(`SELECT pg_temp.p243($1, $2) r`, [uid, anon]))[0].r as Cell } finally { await q('ROLLBACK TO SAVEPOINT m243'); await q('RESET ROLE') }
  }
  const STD = { admin: admin.uid, serviceleder: sim.serviceleder, bogholderi: sim.bogholderi, salg: sim.salg, montor: montor.uid } as const
  const measureStd = async () => {
    const o: Record<string, Cell> = {}
    for (const [k, u] of Object.entries(STD)) o[k] = await m(u)
    return o
  }
  const visOf = (c: Cell) => c.vis.map((x) => label.get(x) ?? x).sort()
  const wOf = (c: Cell) => WRITES.filter((k) => c.w?.[k] === true)
  const fmt = (c: Cell) => `ser=[${visOf(c)}] skriver=[${wOf(c)}]`
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])
  const eq = (a: Cell, b: Cell) => same(visOf(a), visOf(b)) && same(wOf(a), wOf(b))
  const ov = (uid: string, rows: Array<{ permission: string; effect: string }>) => q(`INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${rows.map((o) => `('${uid}', '${o.permission}', '${o.effect}', 'manual', 'rollback-prøve 00243')`).join(',')}`)
  const clearOv = (uid: string) => q(`DELETE FROM public.user_permission_overrides WHERE profile_id = '${uid}'`)

  // ---- 1) aktuelt installeret
  const cur = await measureStd()
  // ---- 2) gammel (00161)
  await q(oldTimeLogFunctions())
  const old = await measureStd()
  await q(`UPDATE public.profiles SET is_active = false WHERE id = '${montor.uid}'`)
  const oldInactive = await m(montor.uid)
  await q(`UPDATE public.profiles SET is_active = true WHERE id = '${montor.uid}'`)
  // ---- 3) ny (den committede 00243-migrations krop, inkl. dens værn)
  await q(migrationBody())
  const nu = await measureStd()
  const extra: Record<string, Cell> = {}
  for (const [k, tpl] of [['elektriker', 'elektriker'], ['overmontor', 'overmontor']] as const) {
    const rows = templateOverrides(PERMISSION_TEMPLATES[tpl])
    if (rows.length) await ov(montor.uid, rows)
    extra[k] = await m(montor.uid)
    await clearOv(montor.uid)
  }
  await ov(montor.uid, [{ permission: 'time_logs.view.all', effect: 'grant' }, { permission: 'time_logs.edit.all', effect: 'grant' }])
  extra.montor_grant_all = await m(montor.uid)
  await clearOv(montor.uid)
  extra.montor_grant_fjernet = await m(montor.uid)
  await ov(montor.uid, [{ permission: 'time_logs.view.own', effect: 'revoke' }, { permission: 'time_logs.create', effect: 'revoke' }, { permission: 'time_logs.edit.own', effect: 'revoke' }])
  extra.montor_revoke_own = await m(montor.uid)
  await clearOv(montor.uid)
  extra.montor_revoke_fjernet = await m(montor.uid)
  await ov(sim.bogholderi, [{ permission: 'time_logs.view.all', effect: 'revoke' }])
  extra.bogholderi_revoke_all = await m(sim.bogholderi)
  await clearOv(sim.bogholderi)
  extra.bogholderi_revoke_fjernet = await m(sim.bogholderi)
  await ov(sim.salg, [{ permission: 'time_logs.view.all', effect: 'grant' }])
  extra.salg_grant_view_all = await m(sim.salg)
  await clearOv(sim.salg)
  extra.salg_grant_fjernet = await m(sim.salg)
  await q(`UPDATE public.profiles SET is_active = false WHERE id = '${montor.uid}'`)
  extra.inaktiv = await m(montor.uid)
  await q(`UPDATE public.profiles SET is_active = true WHERE id = '${montor.uid}'`)
  extra.anon = await m(null, true)
  extra.uden_profil = await m(randomUUID())

  // ---- vurdering
  const curRef = applied ? nu : old
  for (const k of Object.keys(STD)) add('UÆNDRET', `AKTUEL (${applied ? '00243' : '00161'}) == ${applied ? 'migrationens krop' : 'gammel 00161'}: ${k}`, eq(cur[k], curRef[k]), fmt(cur[k]))
  for (const k of Object.keys(STD)) {
    const ok = eq(old[k], nu[k])
    add('UÆNDRET', `ÆKVIVALENS ${k} (nul overrides): gammel == ny`, ok, ok ? fmt(nu[k]) : `gammel ${fmt(old[k])} ≠ ny ${fmt(nu[k])}`)
  }
  const MONTOR_VIS = ['tl_col_on_mine', 'tl_m_on_col', 'tl_m_own']
  const want: Record<string, { vis: readonly string[]; w: readonly string[] }> = {
    admin: { vis: ROWS, w: WRITES }, serviceleder: { vis: ROWS, w: WRITES }, bogholderi: { vis: ROWS, w: [] },
    salg: { vis: ['tl_col_salgown'], w: [] }, montor: { vis: MONTOR_VIS, w: ['w_m_mine'] },
    elektriker: { vis: MONTOR_VIS, w: ['w_m_mine'] }, overmontor: { vis: MONTOR_VIS, w: ['w_m_mine'] },
    montor_grant_all: { vis: ROWS, w: WRITES }, montor_grant_fjernet: { vis: MONTOR_VIS, w: ['w_m_mine'] },
    montor_revoke_own: { vis: [], w: [] }, montor_revoke_fjernet: { vis: MONTOR_VIS, w: ['w_m_mine'] },
    bogholderi_revoke_all: { vis: [], w: [] }, bogholderi_revoke_fjernet: { vis: ROWS, w: [] },
    salg_grant_view_all: { vis: ROWS, w: [] }, salg_grant_fjernet: { vis: ['tl_col_salgown'], w: [] },
    inaktiv: { vis: [], w: [] }, anon: { vis: [], w: [] }, uden_profil: { vis: [], w: [] },
  }
  const all: Record<string, Cell> = { ...nu, ...extra }
  for (const [k, w] of Object.entries(want)) {
    const c = all[k]
    const isNew = !(k in STD) && !['elektriker', 'overmontor', 'inaktiv', 'anon', 'uden_profil'].includes(k)
    add(isNew ? 'NY' : 'UÆNDRET', `MATRIX ${k}`, !!c && same(visOf(c), w.vis) && same(wOf(c), w.w), c ? fmt(c) : 'mangler')
  }
  const leak = ['montor', 'elektriker', 'overmontor'].filter((k) => visOf(all[k]).some((x) => ['tl_col_other', 'tl_col_d4', 'tl_col_salgown'].includes(x)))
  add('UÆNDRET', 'KOLLEGA: montør/Elektriker/Overmontør ser ingen kollega-timer på andre arbejdsordrer', leak.length === 0, leak.length ? `læk: ${leak}` : '')
  add('UÆNDRET', 'SALG: tildelt (D4) sag giver IKKE timer (ingen F1-udvidelse)', !visOf(nu.salg).includes('tl_col_d4'), fmt(nu.salg))
  add('UÆNDRET', 'INAKTIV: intet (gammel og ny)', visOf(extra.inaktiv).length === 0 && wOf(extra.inaktiv).length === 0, `gammel ${fmt(oldInactive)} → ny ${fmt(extra.inaktiv)}`)
  const sessions = Object.entries({ ...Object.fromEntries(Object.entries(old).map(([k, v]) => [`gammel_${k}`, v])), ...all }).filter(([k]) => k !== 'anon')
  const costOpen = sessions.filter(([, c]) => c.cost !== '42501' || c.cost_rate !== '42501').map(([k]) => k)
  add('UÆNDRET', 'KOST: cost_amount/cost_rate_snapshot giver 42501 for alle brugersessioner (gammel og ny)', costOpen.length === 0, costOpen.length ? `åben for ${costOpen}` : `${sessions.length} sessioner`)
  const apprOpen = sessions.filter(([, c]) => c.approve !== '42501').map(([k]) => k)
  add('UÆNDRET', 'GODKENDELSE: approval_status kan ikke sættes via brugersession', apprOpen.length === 0, apprOpen.length ? `tilladt for ${apprOpen}` : 'kun service-role-flowet')
}))
