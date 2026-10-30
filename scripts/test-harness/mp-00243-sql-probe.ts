/**
 * MP-00243 time_logs — ROLLBACK-ONLY prøve på staging (intet anvendes, heller ikke når 00243 allerede er anvendt):
 *   I ÉN DO-blok der ALTID slutter med RAISE EXCEPTION: fixtures (kollega-medarbejder, arbejdsordrer, timer) → de GAMLE
 *   rolle-funktioner (00161, fra migrationsfilen) installeres og måles → 00243-udkastet køres → samme måling.
 * Pr. persona (rigtige uid'er, SET LOCAL ROLE authenticated + request.jwt.claims):
 *   synlige timer, can_write_time_log for 4 kombinationer, kost-kolonner (skal give 42501), godkendelsesfelt (42501).
 * Krav (Henrik 2026-10-30): standardroller uden overrides IDENTISKE gammel/ny; ingen montør ser kollegers timer på
 * andre arbejdsordrer; godkendelse forbliver adskilt; kost/løn lukket; inaktiv/manglende profil = intet.
 *   npx tsx scripts/test-harness/cli.ts mp-00243-sql-probe
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PERMISSION_TEMPLATES, templateOverrides } from '../../src/lib/auth/permission-templates'
import { setup240, type M240Check } from './mp-00240-scope-check'
import { draftBodyOf } from './mp-00241-00242-sql-probe'

type RawSql = (sql: string) => Promise<{ ok: boolean; status: number; text: string }>

/** De to rolle-baserede funktioner præcis som 00161 definerede dem (kilden til "gammel" adfærd) */
export function oldTimeLogFunctions(): string {
  const sql = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '00161_rls_residual_risks_r1_r4.sql'), 'utf8').replace(/\r\n/g, '\n')
  const out: string[] = []
  for (const fn of ['can_view_time_log', 'can_write_time_log']) {
    const a = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`)
    const b = sql.indexOf('\n$$;', a)
    if (a < 0 || b < 0) throw new Error(`00161: ${fn} ikke fundet`)
    out.push(sql.slice(a, b + 4))
  }
  return out.join('\n')
}

/** Er 00243 anvendt? (markør: can_view_time_log bruger rettighedsnøgler i stedet for user_role()) */
export async function is00243Applied(rawSql: RawSql): Promise<boolean> {
  const r = await rawSql(`SELECT prosrc FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'can_view_time_log'`)
  if (!r.ok) throw new Error(`kunne ikke læse can_view_time_log: ${r.text.slice(0, 200)}`)
  return ((JSON.parse(r.text) as Array<{ prosrc: string }>)[0]?.prosrc ?? '').includes('time_logs.view.all')
}

/** Fingeraftryk af alt 00243 må (ikke) røre: funktioner, politikker, kolonne-grants, triggere, ACL */
export const FP_00243_SQL = `SELECT json_build_object(
  'fn', (SELECT json_agg(proname || ':' || md5(prosrc) || ':' || prosecdef || ':' || coalesce(array_to_string(proacl, ','), '') ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('can_view_time_log','can_write_time_log','user_has_permission','current_employee_id','time_logs_approval_guard')),
  'pol', (SELECT json_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'time_logs'),
  'colgrants', (SELECT json_agg(grantee || ':' || privilege_type || ':' || column_name ORDER BY grantee, privilege_type, column_name) FROM information_schema.column_privileges WHERE table_schema = 'public' AND table_name = 'time_logs' AND grantee IN ('anon', 'authenticated')),
  'tblgrants', (SELECT json_agg(grantee || ':' || privilege_type ORDER BY grantee, privilege_type) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'time_logs' AND grantee IN ('anon', 'authenticated')),
  'trg', (SELECT json_agg(tgname ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'public.time_logs'::regclass AND NOT tgisinternal),
  'rows', (SELECT count(*) FROM public.time_logs)) f`

const ROWS = ['tl_m_own', 'tl_col_on_mine', 'tl_m_on_col', 'tl_col_other', 'tl_col_d4', 'tl_col_salgown'] as const
const WRITES = ['w_m_mine', 'w_m_col', 'w_col_mine', 'w_col_col'] as const

export async function runMp00243SqlProbe(c: { admin: SupabaseClient; url: string; anonKey: string; rawSql: RawSql }): Promise<M240Check[]> {
  const out: M240Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const fp = async () => (await c.rawSql(FP_00243_SQL)).text
  const before = await fp()
  const applied = await is00243Applied(c.rawSql)
  add(`00243 anvendt på staging før prøven: ${applied ? 'ja (prøven = post-check)' : 'nej'}`, true)
  const { fx, cleanup } = await setup240(c)
  try {
    const { loginPersonas } = await import('./role-matrix')
    const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
    const uid: Record<string, string> = {}
    for (const r of ['admin', 'serviceleder', 'bogholderi']) uid[r] = (await p.get(r as never)!.auth.getUser()).data.user!.id
    const { data: woMine } = await c.admin.from('work_orders').select('id').eq('case_id', fx.cases.wo).single()
    const L: Record<string, string> = { wo_mine: (woMine as { id: string }).id }
    const id = (k: string) => (L[k] ??= randomUUID())
    const ins: string[] = []
    // kollega-medarbejder (uden login) med satser, så kost-triggerne accepterer timerne
    ins.push(`INSERT INTO public.employees (id, name, email, role, active, hourly_rate, cost_rate) VALUES ('${id('e_col')}', '[PROBE] 243 kollega', 'p243-col-${fx.stamp}@harness.test', 'montør', true, 495, 300);`)
    ins.push(`INSERT INTO public.service_cases (id, title, customer_id, created_by) VALUES ('${id('case_salgown')}', '[PROBE] 243', '${fx.cust.salgCase}', '${fx.s.uid}');`)
    const wo = (k: string, cs: string, cust: string) =>
      ins.push(`INSERT INTO public.work_orders (id, case_id, customer_id, title, status, scheduled_date, assigned_employee_id) VALUES ('${id(k)}', '${cs}', '${cust}', '[PROBE] 243', 'planned', '2026-10-01', '${L.e_col}');`)
    wo('wo_col', fx.cases.hidden, fx.cust.hidden)
    wo('wo_col_d4', fx.cases.salgD4, fx.cust.salgCase)
    wo('wo_col_salgown', L.case_salgown, fx.cust.salgCase)
    const tl = (k: string, emp: string, w: string) =>
      ins.push(`INSERT INTO public.time_logs (id, employee_id, work_order_id, start_time, end_time, description) VALUES ('${id(k)}', '${emp}', '${w}', '2026-10-01 07:00+00', '2026-10-01 09:00+00', '[PROBE] 243');`)
    tl('tl_m_own', fx.m.empId, L.wo_mine)
    tl('tl_col_on_mine', L.e_col, L.wo_mine)
    tl('tl_m_on_col', fx.m.empId, L.wo_col)
    tl('tl_col_other', L.e_col, L.wo_col)
    tl('tl_col_d4', L.e_col, L.wo_col_d4)
    tl('tl_col_salgown', L.e_col, L.wo_col_salgown)
    const label = new Map(Object.entries(L).map(([k, v]) => [v, k]))
    const idArr = `ARRAY[${ROWS.map((k) => `'${L[k]}'::uuid`).join(',')}]`
    const writeSql = [
      `'w_m_mine', public.can_write_time_log('${fx.m.empId}', '${L.wo_mine}')`,
      `'w_m_col', public.can_write_time_log('${fx.m.empId}', '${L.wo_col}')`,
      `'w_col_mine', public.can_write_time_log('${L.e_col}', '${L.wo_mine}')`,
      `'w_col_col', public.can_write_time_log('${L.e_col}', '${L.wo_col}')`,
    ].join(', ')
    const ov = (profile: string, rows: Array<{ permission: string; effect: string }>) => rows.length
      ? `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${rows.map((o) => `('${profile}', '${o.permission}', '${o.effect}', 'manual', 'probe 243')`).join(',')};`
      : ''
    const clearOv = (profile: string) => `DELETE FROM public.user_permission_overrides WHERE profile_id = '${profile}';`
    const tplOv = (k: keyof typeof PERMISSION_TEMPLATES) => templateOverrides(PERMISSION_TEMPLATES[k])
    const std = `jsonb_build_object('admin', pg_temp.p243('${uid.admin}'), 'serviceleder', pg_temp.p243('${uid.serviceleder}'),
        'bogholderi', pg_temp.p243('${uid.bogholderi}'), 'salg', pg_temp.p243('${fx.s.uid}'), 'montor', pg_temp.p243('${fx.m.uid}'))`
    const sql = `DO $probe$
DECLARE res jsonb := '{}'::jsonb;
BEGIN
  ${ins.join('\n  ')}
  CREATE FUNCTION pg_temp.p243(p_uid uuid, p_anon boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $f$
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
      SELECT coalesce(jsonb_agg(x.id), '[]') INTO v FROM public.time_logs x WHERE x.id = ANY (${idArr});
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
  END $f$;
  -- ---- GAMMEL (00161, rå rolle)
  EXECUTE $old$${oldTimeLogFunctions()}$old$;
  res := res || jsonb_build_object('old', ${std});
  UPDATE public.profiles SET is_active = false WHERE id = '${fx.m.uid}';
  res := jsonb_set(res, '{old,inaktiv}', pg_temp.p243('${fx.m.uid}'));
  UPDATE public.profiles SET is_active = true WHERE id = '${fx.m.uid}';
  -- ---- NY (00243-udkastet)
  EXECUTE $draft$${draftBodyOf('mp-00243-draft.sql')}$draft$;
  res := res || jsonb_build_object('new', ${std});
  ${ov(fx.m.uid, tplOv('elektriker'))}
  res := jsonb_set(res, '{new,elektriker}', pg_temp.p243('${fx.m.uid}'));
  ${clearOv(fx.m.uid)}
  ${ov(fx.m.uid, tplOv('overmontor'))}
  res := jsonb_set(res, '{new,overmontor}', pg_temp.p243('${fx.m.uid}'));
  ${clearOv(fx.m.uid)}
  ${ov(fx.m.uid, [{ permission: 'time_logs.view.all', effect: 'grant' }, { permission: 'time_logs.edit.all', effect: 'grant' }])}
  res := jsonb_set(res, '{new,montor_grant_all}', pg_temp.p243('${fx.m.uid}'));
  ${clearOv(fx.m.uid)}
  ${ov(fx.m.uid, [{ permission: 'time_logs.view.own', effect: 'revoke' }, { permission: 'time_logs.create', effect: 'revoke' }, { permission: 'time_logs.edit.own', effect: 'revoke' }])}
  res := jsonb_set(res, '{new,montor_revoke_own}', pg_temp.p243('${fx.m.uid}'));
  ${clearOv(fx.m.uid)}
  ${ov(uid.bogholderi, [{ permission: 'time_logs.view.all', effect: 'revoke' }])}
  res := jsonb_set(res, '{new,bogholderi_revoke_all}', pg_temp.p243('${uid.bogholderi}'));
  ${clearOv(uid.bogholderi)}
  UPDATE public.profiles SET is_active = false WHERE id = '${fx.m.uid}';
  res := jsonb_set(res, '{new,inaktiv}', pg_temp.p243('${fx.m.uid}'));
  UPDATE public.profiles SET is_active = true WHERE id = '${fx.m.uid}';
  res := jsonb_set(res, '{new,anon}', pg_temp.p243(NULL, true));
  res := jsonb_set(res, '{new,uden_profil}', pg_temp.p243('${randomUUID()}'));
  RAISE EXCEPTION 'P243RESULT%P243END', res::text;
END
$probe$;`
    const r = await c.rawSql(sql)
    const m = r.text.match(/P243RESULT([\s\S]*?)P243END/)
    if (r.ok || !m) {
      add('udkastet kørte i rollback-only-prøven', false, r.ok ? 'blev IKKE afbrudt (!)' : r.text.slice(0, 800))
      return out
    }
    add('gammel (00161) + ny (00243-udkast) + matrix kørte uden fejl i rollback-only-prøven', true)
    type Cell = { vis: string[]; w: Record<string, boolean>; cost: string; cost_rate: string; approve: string }
    const res = JSON.parse(m[1].replace(/\\"/g, '"')) as { old: Record<string, Cell>; new: Record<string, Cell> }
    const visOf = (cell: Cell) => cell.vis.map((x) => label.get(x) ?? x).sort()
    const wOf = (cell: Cell) => WRITES.filter((k) => cell.w?.[k] === true)
    const fmt = (cell: Cell) => `ser=[${visOf(cell)}] skriver=[${wOf(cell)}]`
    const same = (a: string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])

    // 1) Nul-override-ækvivalens: gammel == ny for alle standardroller
    for (const k of ['admin', 'serviceleder', 'bogholderi', 'salg', 'montor']) {
      const o = res.old[k], n = res.new[k]
      const ok = same(visOf(o), visOf(n)) && same(wOf(o), wOf(n))
      add(`ÆKVIVALENS ${k}: gammel == ny`, ok, ok ? fmt(n) : `gammel ${fmt(o)} ≠ ny ${fmt(n)}`)
    }
    // 2) Forventet matrix (ny)
    const MONTOR_VIS = ['tl_col_on_mine', 'tl_m_on_col', 'tl_m_own']
    const want: Record<string, { vis: readonly string[]; w: readonly string[] }> = {
      admin: { vis: ROWS, w: WRITES }, serviceleder: { vis: ROWS, w: WRITES }, bogholderi: { vis: ROWS, w: [] },
      salg: { vis: ['tl_col_salgown'], w: [] }, montor: { vis: MONTOR_VIS, w: ['w_m_mine'] },
      elektriker: { vis: MONTOR_VIS, w: ['w_m_mine'] }, overmontor: { vis: MONTOR_VIS, w: ['w_m_mine'] },
      montor_grant_all: { vis: ROWS, w: WRITES }, montor_revoke_own: { vis: [], w: [] },
      bogholderi_revoke_all: { vis: [], w: [] }, inaktiv: { vis: [], w: [] }, anon: { vis: [], w: [] }, uden_profil: { vis: [], w: [] },
    }
    for (const [k, w] of Object.entries(want)) {
      const n = res.new[k]
      if (!n) { add(`MATRIX ${k}`, false, 'mangler i resultatet'); continue }
      add(`MATRIX ${k}`, same(visOf(n), w.vis) && same(wOf(n), w.w), fmt(n))
    }
    // 3) Kollega-timer: ingen montør-variant ser kollegers timer på andres arbejdsordrer
    const leak = ['montor', 'elektriker', 'overmontor'].filter((k) => visOf(res.new[k]).some((x) => ['tl_col_other', 'tl_col_d4', 'tl_col_salgown'].includes(x)))
    add('KOLLEGA: montør/Elektriker/Overmontør ser ingen kollega-timer på andre arbejdsordrer', leak.length === 0, leak.length ? `læk: ${leak}` : '')
    // 4) Inaktiv: aldrig bredere end før (gammel kunne give en inaktiv montør adgang — ny er fail-closed)
    add('INAKTIV: ny ⊆ gammel og = intet', visOf(res.new.inaktiv).length === 0 && wOf(res.new.inaktiv).length === 0, `gammel ${fmt(res.old.inaktiv)} → ny ${fmt(res.new.inaktiv)}`)
    // 5) Kost/løn og godkendelse: 42501 for alle brugersessioner (gammel og ny)
    const personas = Object.keys(res.new).filter((k) => k !== 'anon')
    const costOpen = personas.filter((k) => res.new[k].cost !== '42501' || res.new[k].cost_rate !== '42501')
    add('KOST: cost_amount/cost_rate_snapshot giver 42501 for alle sessioner (ny)', costOpen.length === 0, costOpen.length ? `åben for ${costOpen}` : `${personas.length} sessioner`)
    const apprOpen = personas.filter((k) => res.new[k].approve !== '42501')
    add('GODKENDELSE: approval_status kan ikke sættes via brugersession (ny)', apprOpen.length === 0, apprOpen.length ? `tilladt for ${apprOpen}` : 'kun godkendelsesflowet (service-role)')
  } catch (e) {
    add('kørsel uden undtagelse', false, e instanceof Error ? e.message : String(e))
  } finally {
    const left = await cleanup()
    out.push({ id: 'oprydning: ingen testkunder tilbage', ok: left === 0, note: `tilbage=${left}` })
    const after = await fp()
    out.push({ id: 'intet anvendt: funktioner/politikker/grants/triggere/rækker identiske før/efter', ok: before === after, note: before === after ? '' : `${before.slice(0, 300)} ≠ ${after.slice(0, 300)}` })
  }
  return out
}
