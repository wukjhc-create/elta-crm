/**
 * 00252 (customer_tasks.customer_visible + værn) — STAGING-prøver. Alle prøver er ROLLBACK-ONLY (én forespørgsel der
 * slutter med RAISE EXCEPTION): migrationskroppen + test som rigtige roller (authenticated via SET LOCAL ROLE + JWT-claims,
 * service_role) + rollback-bevis (struktur-md5 = før). Kun antal/koder ud.
 *   npx tsx scripts/test-harness/cli.ts portal-00252-state | portal-00252-probe | portal-00252-rollback-proof
 *   npx tsx scripts/test-harness/cli.ts portal-00252-apply-staging --confirm   (permanent på STAGING efter grøn prøve)
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { STRUCT_MD5 } from './reception-00249-probe'
import { STRUCT_PARTS } from './reception-00250-probe'

export function migration00252Body(): string {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/00252_customer_tasks_customer_visible.sql'), 'utf8')
  return sql.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')
}

export function rollback00252Sql(withTx = true): string {
  const body = `DROP TRIGGER IF EXISTS trg_customer_tasks_visibility_guard ON public.customer_tasks;
DROP FUNCTION IF EXISTS public.customer_tasks_visibility_guard();
ALTER TABLE public.customer_tasks DROP COLUMN IF EXISTS customer_visible;`
  return withTx ? `BEGIN;\n${body}\nCOMMIT;` : body
}

export const STATE_00252_SQL = `SELECT json_build_object(
  'applied_252', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='customer_visible'),
  'tasks', (SELECT count(*) FROM public.customer_tasks),
  'md5_struct', ${STRUCT_MD5}, 'parts', ${STRUCT_PARTS}) f`

const HELPER = `
CREATE FUNCTION pg_temp.p252(q text, uid uuid, r text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r)::text, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', r, true);
  EXECUTE 'SET LOCAL ROLE ' || r;
  IF q ILIKE 'select count%' THEN EXECUTE q INTO n; RESET ROLE; RETURN n::text; END IF;
  EXECUTE q;
  RESET ROLE;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN SQLSTATE;
END $f$;`

export function probe00252Sql(): string {
  return `${migration00252Body()}
${HELPER}
DO $probe$
DECLARE
  res jsonb := '{}'::jsonb;
  u_admin uuid; u_salg uuid; u_mont uuid; v_cust uuid; t1 uuid; t2 uuid; r text;
  pick text := 'SELECT p.id FROM public.profiles p WHERE p.is_active AND p.role = %L AND NOT EXISTS (SELECT 1 FROM public.user_permission_overrides o WHERE o.profile_id = p.id) ORDER BY p.created_at LIMIT 1';
BEGIN
  EXECUTE format(pick, 'admin') INTO u_admin;
  EXECUTE format(pick, 'salg') INTO u_salg;
  EXECUTE format(pick, 'montør') INTO u_mont;
  SELECT id INTO v_cust FROM public.customers ORDER BY created_at LIMIT 1;
  res := res || jsonb_build_object('personas', jsonb_build_object('admin', u_admin IS NOT NULL, 'salg', u_salg IS NOT NULL, 'montor', u_mont IS NOT NULL, 'customer', v_cust IS NOT NULL));
  -- alle eksisterende opgaver er private efter migrationen (ingen backfill)
  res := res || jsonb_build_object('existing_visible', (SELECT count(*) FROM public.customer_tasks WHERE customer_visible), 'existing_total', (SELECT count(*) FROM public.customer_tasks),
    'col_default', (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='customer_visible'),
    'col_nullable', (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='customer_visible'),
    'guard_exec_anon', has_function_privilege('anon', 'public.customer_tasks_visibility_guard()', 'EXECUTE'),
    'guard_exec_auth', has_function_privilege('authenticated', 'public.customer_tasks_visibility_guard()', 'EXECUTE'),
    'trigger_enabled', (SELECT tgenabled::text FROM pg_trigger WHERE tgname = 'trg_customer_tasks_visibility_guard'));

  -- admin (authenticated): opret intern opgave = ok; opret kundesynlig = 42501
  res := res || jsonb_build_object('admin_insert_private', pg_temp.p252(format('INSERT INTO public.customer_tasks (customer_id, title, status, priority, created_by) VALUES (%L, %L, %L, %L, %L)', v_cust, 'p252 intern', 'pending', 'normal', u_admin), u_admin, 'authenticated'));
  res := res || jsonb_build_object('admin_insert_visible', pg_temp.p252(format('INSERT INTO public.customer_tasks (customer_id, title, status, priority, created_by, customer_visible) VALUES (%L, %L, %L, %L, %L, true)', v_cust, 'Besigtigelse hos p252', 'pending', 'normal', u_admin), u_admin, 'authenticated'));
  res := res || jsonb_build_object('salg_insert_visible', pg_temp.p252(format('INSERT INTO public.customer_tasks (customer_id, title, status, priority, created_by, customer_visible) VALUES (%L, %L, %L, %L, %L, true)', v_cust, 'Besigtigelse hos p252', 'pending', 'normal', u_salg), u_salg, 'authenticated'));
  SELECT id INTO t1 FROM public.customer_tasks WHERE title = 'p252 intern' AND customer_id = v_cust ORDER BY created_at DESC LIMIT 1;
  -- admin (authenticated): ret titel = ok; slå kundesynlighed til = 42501
  res := res || jsonb_build_object('admin_update_title', pg_temp.p252(format('UPDATE public.customer_tasks SET title = %L WHERE id = %L', 'p252 intern 2', t1), u_admin, 'authenticated'));
  res := res || jsonb_build_object('admin_update_visible', pg_temp.p252(format('UPDATE public.customer_tasks SET customer_visible = true WHERE id = %L', t1), u_admin, 'authenticated'));
  res := res || jsonb_build_object('t1_visible_after_attack', (SELECT customer_visible FROM public.customer_tasks WHERE id = t1));
  -- service_role (serverens kontrollerede sti): må sætte flaget og oprette kundesynlig
  res := res || jsonb_build_object('service_update_visible', pg_temp.p252(format('UPDATE public.customer_tasks SET customer_visible = true WHERE id = %L', t1), NULL, 'service_role'));
  res := res || jsonb_build_object('t1_visible_after_service', (SELECT customer_visible FROM public.customer_tasks WHERE id = t1));
  res := res || jsonb_build_object('service_insert_visible', pg_temp.p252(format('INSERT INTO public.customer_tasks (customer_id, title, status, priority, customer_visible) VALUES (%L, %L, %L, %L, true)', v_cust, 'PORTAL: Besigtigelse p252', 'pending', 'high'), NULL, 'service_role'));
  -- authenticated kan ikke slå en kundesynlig opgave FRA heller (kun serveren styrer flaget); andre felter må rettes
  res := res || jsonb_build_object('admin_update_visible_off', pg_temp.p252(format('UPDATE public.customer_tasks SET customer_visible = false WHERE id = %L', t1), u_admin, 'authenticated'));
  res := res || jsonb_build_object('admin_update_status_visible_task', pg_temp.p252(format('UPDATE public.customer_tasks SET status = %L WHERE id = %L', 'done', t1), u_admin, 'authenticated'));
  -- montør: eksisterende 00235-værn uændret (kan ikke tildele andre)
  res := res || jsonb_build_object('montor_insert_visible', pg_temp.p252(format('INSERT INTO public.customer_tasks (customer_id, title, status, priority, created_by, assigned_to, customer_visible) VALUES (%L, %L, %L, %L, %L, %L, true)', v_cust, 'p252 m', 'pending', 'normal', u_mont, u_mont), u_mont, 'authenticated'));
  -- anon: ingen adgang til tabellen
  res := res || jsonb_build_object('anon_select', pg_temp.p252('SELECT count(*) FROM public.customer_tasks WHERE customer_visible', NULL, 'anon'));
  RAISE EXCEPTION 'P252RESULT:%', res::text;
END $probe$;`
}

export interface P252Check { id: string; ok: boolean; note: string }
export function evaluateProbe252(r: Record<string, any>): P252Check[] {
  const c = (id: string, ok: boolean, note: unknown = '') => ({ id, ok, note: typeof note === 'string' ? note : JSON.stringify(note) })
  const anonDenied = r.anon_select === '42501' || r.anon_select === '0'
  return [
    c('personaer fundet (admin, salg, montør, kunde)', r.personas?.admin && r.personas?.salg && r.personas?.montor && r.personas?.customer, r.personas),
    c('alle eksisterende opgaver er private efter migrationen (ingen backfill)', r.existing_visible === 0 && r.existing_total >= 0, { v: r.existing_visible, n: r.existing_total }),
    c("kolonnen er NOT NULL DEFAULT false", r.col_nullable === 'NO' && /false/.test(String(r.col_default)), { n: r.col_nullable, d: r.col_default }),
    c('værn-funktionen kan ikke kaldes af anon/authenticated; triggeren er slået til', r.guard_exec_anon === false && r.guard_exec_auth === false && r.trigger_enabled === 'O', { a: r.guard_exec_anon, u: r.guard_exec_auth, t: r.trigger_enabled }),
    c('admin (authenticated) kan oprette en intern opgave', r.admin_insert_private === 'ok', r.admin_insert_private),
    c('admin (authenticated) kan IKKE oprette en kundesynlig opgave (42501)', r.admin_insert_visible === '42501', r.admin_insert_visible),
    c('salg (authenticated) kan IKKE oprette en kundesynlig opgave (42501)', r.salg_insert_visible === '42501', r.salg_insert_visible),
    c('montør (authenticated) kan IKKE oprette en kundesynlig opgave (42501)', r.montor_insert_visible === '42501', r.montor_insert_visible),
    c('admin kan stadig rette en opgaves titel', r.admin_update_title === 'ok', r.admin_update_title),
    c('admin kan IKKE slå kundesynlighed til direkte (42501) — flaget forbliver false', r.admin_update_visible === '42501' && r.t1_visible_after_attack === false, { r: r.admin_update_visible, v: r.t1_visible_after_attack }),
    c('service_role (serverens kontrollerede sti) kan sætte flaget og oprette kundesynlig opgave', r.service_update_visible === 'ok' && r.t1_visible_after_service === true && r.service_insert_visible === 'ok', { u: r.service_update_visible, v: r.t1_visible_after_service, i: r.service_insert_visible }),
    c('admin kan IKKE slå kundesynlighed fra direkte (42501), men kan rette status', r.admin_update_visible_off === '42501' && r.admin_update_status_visible_task === 'ok', { off: r.admin_update_visible_off, st: r.admin_update_status_visible_task }),
    c('anon har ingen adgang til customer_tasks', anonDenied, r.anon_select),
  ]
}

export function rollbackProof00252Sql(): string {
  return `${migration00252Body()}
${rollback00252Sql(false)}
DO $rb$ BEGIN
  RAISE EXCEPTION 'P252ROLLBACK:%', json_build_object(
    'col_left', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='customer_visible'),
    'fn_left', (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname = 'customer_tasks_visibility_guard'),
    'trg_left', (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_customer_tasks_visibility_guard'),
    'tasks', (SELECT count(*) FROM public.customer_tasks),
    'md5_struct', ${STRUCT_MD5}, 'parts', ${STRUCT_PARTS})::text;
END $rb$;`
}
