/**
 * 00253 (sync_leases) — STAGING-prøver. probe/rollback-proof er ROLLBACK-ONLY (én forespørgsel → RAISE EXCEPTION).
 *   npx tsx scripts/test-harness/cli.ts sync-lease-00253-state | sync-lease-00253-probe | sync-lease-00253-rollback-proof
 *   npx tsx scripts/test-harness/cli.ts sync-lease-00253-apply-staging --confirm
 *   npx tsx scripts/test-harness/cli.ts sync-lease-concurrency-staging   (kræver 00253 på staging; parallelle forbindelser)
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { STRUCT_MD5 } from './reception-00249-probe'
import { STRUCT_PARTS } from './reception-00250-probe'

export function migration00253Body(): string {
  return readFileSync(resolve(process.cwd(), 'supabase/migrations/00253_sync_leases.sql'), 'utf8').replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')
}
export function rollback00253Sql(): string {
  return readFileSync(resolve(process.cwd(), 'docs/runbooks/sql/00253_rollback.sql'), 'utf8').replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '')
}
export const STATE_00253_SQL = `SELECT json_build_object('applied_253', to_regclass('public.sync_leases') IS NOT NULL, 'md5_struct', ${STRUCT_MD5}, 'parts', ${STRUCT_PARTS}) f`

const HELPER = `
CREATE FUNCTION pg_temp.p253(q text, r text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', r)::text, true);
  EXECUTE 'SET LOCAL ROLE ' || r;
  EXECUTE q INTO v;
  RESET ROLE;
  RETURN coalesce(v, 'NULL');
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RETURN 'ERR:' || SQLSTATE;
END $f$;`

export function probe00253Sql(): string {
  return `${migration00253Body()}
${HELPER}
DO $probe$
DECLARE res jsonb := '{}'::jsonb; h1 text; h2 text; h3 text;
BEGIN
  h1 := pg_temp.p253($q$SELECT public.sync_lease_acquire('email-sync', 330)::text$q$, 'service_role');
  h2 := pg_temp.p253($q$SELECT public.sync_lease_acquire('email-sync', 330)::text$q$, 'service_role');
  res := res || jsonb_build_object('first_acquire_uuid', h1 ~ '^[0-9a-f-]{36}$', 'second_acquire_null', h2 = 'NULL');
  res := res || jsonb_build_object('release_wrong_holder', pg_temp.p253(format($q$SELECT public.sync_lease_release('email-sync', %L)::text$q$, gen_random_uuid()), 'service_role'));
  res := res || jsonb_build_object('release_holder', pg_temp.p253(format($q$SELECT public.sync_lease_release('email-sync', %L::uuid)::text$q$, h1), 'service_role'));
  h3 := pg_temp.p253($q$SELECT public.sync_lease_acquire('email-sync', 330)::text$q$, 'service_role');
  res := res || jsonb_build_object('reacquire_after_release', h3 ~ '^[0-9a-f-]{36}$');
  -- udløbet lease (kørsel dræbt ved timeout) overtages
  UPDATE public.sync_leases SET expires_at = now() - interval '1 second' WHERE name = 'email-sync';
  res := res || jsonb_build_object('takeover_expired', pg_temp.p253($q$SELECT public.sync_lease_acquire('email-sync', 330)::text$q$, 'service_role') ~ '^[0-9a-f-]{36}$');
  res := res || jsonb_build_object('other_name_independent', pg_temp.p253($q$SELECT public.sync_lease_acquire('supplier-sync', 60)::text$q$, 'service_role') ~ '^[0-9a-f-]{36}$');
  res := res || jsonb_build_object('ttl_too_low', pg_temp.p253($q$SELECT public.sync_lease_acquire('x-job', 5)::text$q$, 'service_role'),
    'bad_name', pg_temp.p253($q$SELECT public.sync_lease_acquire('Bad Name!', 60)::text$q$, 'service_role'));
  res := res || jsonb_build_object('anon_acquire', pg_temp.p253($q$SELECT public.sync_lease_acquire('email-sync', 330)::text$q$, 'anon'),
    'auth_acquire', pg_temp.p253($q$SELECT public.sync_lease_acquire('email-sync', 330)::text$q$, 'authenticated'),
    'auth_release', pg_temp.p253(format($q$SELECT public.sync_lease_release('email-sync', %L)::text$q$, gen_random_uuid()), 'authenticated'),
    'auth_table', pg_temp.p253($q$SELECT count(*)::text FROM public.sync_leases$q$, 'authenticated'),
    'service_table', pg_temp.p253($q$SELECT count(*)::text FROM public.sync_leases$q$, 'service_role'),
    'rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sync_leases'::regclass),
    'policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sync_leases'),
    'secdef', (SELECT bool_and(prosecdef) FROM pg_proc WHERE proname IN ('sync_lease_acquire', 'sync_lease_release')),
    'search_path', (SELECT bool_and(array_to_string(proconfig, ',') LIKE '%search_path=public%') FROM pg_proc WHERE proname IN ('sync_lease_acquire', 'sync_lease_release')));
  RAISE EXCEPTION 'P253RESULT:%', res::text;
END $probe$;`
}

export function evaluateProbe253(r: Record<string, any>): Array<{ id: string; ok: boolean; note: string }> {
  const c = (id: string, ok: boolean, note: unknown = '') => ({ id, ok, note: typeof note === 'string' ? note : JSON.stringify(note) })
  return [
    c('første acquire giver holder-uuid; anden (gyldig lease) giver NULL = optaget', r.first_acquire_uuid === true && r.second_acquire_null === true),
    c('release med forkert holder → false; med rigtig holder → true', r.release_wrong_holder === 'false' && r.release_holder === 'true', { w: r.release_wrong_holder, h: r.release_holder }),
    c('acquire efter release lykkes', r.reacquire_after_release === true),
    c('udløbet lease (dræbt kørsel) overtages', r.takeover_expired === true),
    c('andet lease-navn er uafhængigt', r.other_name_independent === true),
    c('ugyldig TTL og ugyldigt navn afvises (22023)', r.ttl_too_low === 'ERR:22023' && r.bad_name === 'ERR:22023', { t: r.ttl_too_low, n: r.bad_name }),
    c('anon/authenticated kan ikke kalde acquire/release (42501)', r.anon_acquire === 'ERR:42501' && r.auth_acquire === 'ERR:42501' && r.auth_release === 'ERR:42501', { a: r.anon_acquire, u: r.auth_acquire, r: r.auth_release }),
    c('tabellen kan ikke læses direkte af authenticated eller service_role (kun via funktionerne)', r.auth_table === 'ERR:42501' && r.service_table === 'ERR:42501', { u: r.auth_table, s: r.service_table }),
    c('RLS slået til, 0 politikker; funktioner SECURITY DEFINER med fast search_path', r.rls === true && Number(r.policies) === 0 && r.secdef === true && r.search_path === true, { rls: r.rls, p: r.policies }),
  ]
}

export function rollbackProof00253Sql(): string {
  return `${migration00253Body()}
${rollback00253Sql()}
DO $rb$ BEGIN
  RAISE EXCEPTION 'P253ROLLBACK:%', json_build_object(
    'table_left', (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'sync_leases'),
    'fn_left', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('sync_lease_acquire', 'sync_lease_release')),
    'md5_struct', ${STRUCT_MD5}, 'parts', ${STRUCT_PARTS})::text;
END $rb$;`
}
