/**
 * 00247 telefoni-persistens — staging-prøver.
 *   tel-00247-state  (read-only)     tabeller/politikker/grants/funktions-ACL/katalog + md5 af kunder, sager, opgaver,
 *                                    audit_logs, mails og rettighedstabeller (før/efter apply)
 *   tel-00247-probe  (ROLLBACK-ONLY DO-blok + separat samtidighedstest der rydder op efter sig)
 *     Er 00247 ikke anvendt, køres migrationskroppen inde i blokken (dry-run); ellers testes den anvendte tilstand, og en
 *     gentagen kørsel af kroppen skal afvises af guarden.
 *     I  ingest (som service_role): samme hændelse 2× → én hændelse/ét opkald; samme id med andet opkald/anden hash →
 *        conflict uden nyt opkald; tre rækkefølger af started/answered/ended → identisk slutrække; sen slut-hændelse
 *        opdaterer varighed/status; ældre slut-hændelse overskriver ikke; ubesvaret/telefonsvarer; SMS afvises;
 *        direkte dublet-INSERT → 23505; hændelser uforanderlige; opkald kan ikke oprettes/rettes med kunde uden
 *        menneskelig bekræftelse; medarbejder-kobling (aktiv/inaktiv); ingest rører ikke kunder/sager/opgaver/audit
 *     M  match: bekræft → stale ved gammel version → ret → afvis (audit pr. trin); sag fra anden kunde → 23514;
 *        tvetydig bærer aldrig forslag; slettet kunde → opkaldet bliver ubekræftet uden sag
 *     R  retention: kun ubekræftede ældre end 90 dage slettes (hændelser følger med)
 *     P  persona-matrix (rigtige uid'er + overrides): synlighed af U/S/A/R/Ci/Cf; ingen skrivning, ingen hændelser/
 *        koblinger, ingen EXECUTE på funktionerne for authenticated/anon
 *     G  politikker, grants, funktions-ACL, RLS slået til, nøgler + standarder
 *   Samtidighed (C, kun når 00247 er anvendt; rigtige parallelle sessioner via Management API, rækker slettes bagefter):
 *     8 samtidige identiske hændelser → 1 hændelse/1 opkald (1 created, 7 duplicate); 3 forskellige hændelser × 3
 *     gentagelser samtidigt for et nyt opkald → 1 opkald, 3 hændelser, korrekt slutstatus; 2 samtidige rettelser med
 *     samme version → én lykkes, én 'stale', én audit-række.
 * Krav: Henrik 2026-11-03 (10 låste beslutninger, docs/runbooks/telephony-events-proposal.md).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { setup240, type M240Check } from './mp-00240-scope-check'

type RawSql = (sql: string) => Promise<{ ok: boolean; status: number; text: string }>

const md5Of = (t: string) => `(SELECT json_build_object('n', count(*), 'md5', md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), ''))) FROM public.${t} x)`
const md5Plain = (t: string, order: string) => `(SELECT json_build_object('n', count(*), 'md5', md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY ${order}), ''))) FROM public.${t} x)`
const FP = `json_build_object(
  'customers', ${md5Of('customers')}, 'service_cases', ${md5Of('service_cases')}, 'customer_tasks', ${md5Of('customer_tasks')},
  'audit_logs', ${md5Of('audit_logs')}, 'incoming_emails', ${md5Of('incoming_emails')},
  'user_permission_overrides', ${md5Plain('user_permission_overrides', 'x.profile_id, x.permission')})`
const TABLES = `('telephony_calls', 'telephony_events', 'telephony_employee_links')`
const FNS = [
  'telephony_ingest_event(text,text,text,text,text,timestamp with time zone,text,text,text,integer,boolean,boolean,integer,text,text,text)',
  'telephony_set_call_match(uuid,integer,text,uuid,uuid,uuid)',
  'telephony_purge_unconfirmed()',
]
const G_SQL = `json_build_object(
  'tables', (SELECT coalesce(json_agg(c.relname || ':rls=' || c.relrowsecurity ORDER BY c.relname), '[]') FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ${TABLES}),
  'pol', (SELECT coalesce(json_agg(tablename || ':' || policyname || ':' || cmd || ':' || roles::text || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') ORDER BY tablename, policyname), '[]') FROM pg_policies WHERE schemaname = 'public' AND tablename IN ${TABLES}),
  'grants', (SELECT coalesce(json_agg(table_name || ':' || grantee || ':' || privilege_type ORDER BY table_name, grantee, privilege_type), '[]') FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ${TABLES} AND grantee IN ('anon', 'authenticated', 'PUBLIC')),
  'col_grants', (SELECT count(*) FROM information_schema.column_privileges WHERE table_schema = 'public' AND table_name IN ${TABLES} AND grantee IN ('anon', 'authenticated', 'PUBLIC') AND privilege_type <> 'SELECT'),
  'fn', (SELECT coalesce(json_agg(f || ':anon=' || has_function_privilege('anon', f, 'EXECUTE') || ':auth=' || has_function_privilege('authenticated', f, 'EXECUTE') || ':sr=' || has_function_privilege('service_role', f, 'EXECUTE') ORDER BY f), '[]')
         FROM unnest(ARRAY[${FNS.map((f) => `'public.${f}'`).join(', ')}]) f WHERE to_regprocedure(f) IS NOT NULL),
  'keys', (SELECT coalesce(json_agg(permission ORDER BY permission), '[]') FROM public.permission_catalog WHERE permission LIKE 'calls.%'),
  'defaults', (SELECT coalesce(json_agg(role || ':' || permission ORDER BY role, permission), '[]') FROM public.role_permission_defaults WHERE permission LIKE 'calls.%'),
  'catalog', (SELECT json_build_object('keys', (SELECT count(*) FROM public.permission_catalog), 'pairs', (SELECT count(*) FROM public.role_permission_defaults))),
  'cols', (SELECT coalesce(json_agg(column_name ORDER BY column_name), '[]') FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'telephony_calls'))`

// dynamisk (query_to_xml), så forespørgslen også kan køres før tabellerne findes
const cnt = (t: string) => `CASE WHEN to_regclass('public.${t}') IS NULL THEN NULL ELSE (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM public.${t}', false, true, '')))[1]::text END`
const STATE_ROWS = `json_build_object('calls', ${cnt('telephony_calls')}, 'events', ${cnt('telephony_events')}, 'links', ${cnt('telephony_employee_links')})`
export const TEL_00247_STATE_SQL = `SELECT json_build_object('applied', to_regclass('public.telephony_calls') IS NOT NULL, 'g', ${G_SQL}, 'fp', ${FP},
  'sr_member', pg_has_role(current_user, 'service_role', 'MEMBER')) f`

/** 00247-kroppen (mellem BEGIN; og COMMIT;) — samme tekst som anvendes */
export function migration00247Body(): string {
  const sql = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '00247_telephony_persistence.sql'), 'utf8').replace(/\r\n/g, '\n')
  const a = sql.indexOf('\nBEGIN;\n'), b = sql.indexOf('\nCOMMIT;\n')
  if (a < 0 || b < a) throw new Error('00247: har ikke BEGIN; … COMMIT;')
  const body = sql.slice(a + '\nBEGIN;\n'.length, b)
  if (body.includes('$mig$')) throw new Error('00247: indeholder $mig$')
  return body
}

/** Den kommenterede ROLLBACK-blok nederst i 00247-filen (fra "-- BEGIN;" til "-- COMMIT;") som kørbar SQL */
export function rollback00247Sql(): string {
  const sql = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '00247_telephony_persistence.sql'), 'utf8').replace(/\r\n/g, '\n')
  const tail = sql.slice(sql.indexOf('\n-- ROLLBACK'))
  const a = tail.indexOf('\n-- BEGIN;\n'), b = tail.indexOf('\n-- COMMIT;\n')
  if (a < 0 || b < a) throw new Error('00247: ROLLBACK-blokken mangler')
  return tail.slice(a + 1, b + '\n-- COMMIT;'.length).split('\n').map((l) => l.replace(/^-- ?/, '')).join('\n')
}

const P = ['U', 'S', 'A', 'R', 'Ci', 'Cf'] as const
const ALL6 = [...P].sort().join(',')
const UNCONF = ['A', 'R', 'S', 'U'].join(',')
const CONF = 'Cf,Ci'
/** Forventet synlighed (sorteret) — = matrixen i proposal-runbooken */
export const WANT_VIS: Record<string, string> = {
  admin: ALL6, serviceleder: ALL6, salg: CONF, bogholderi: '', montor: '',
  montor_grant_view: 'Ci',
  montor_grant_view_viewall: CONF,
  bogholderi_grant_unmatched: UNCONF,
  salg_revoke_view: '',
  serviceleder_revoke_unmatched: CONF,
  inaktiv: '', uden_profil: '', anon: '42501',
}
const WRITE_OPS = ['ins_call', 'upd_call', 'del_call', 'sel_events', 'ins_event', 'sel_links', 'exec_ingest', 'exec_match', 'exec_purge'] as const

export async function runTel00247Probe(c: { admin: SupabaseClient; url: string; anonKey: string; rawSql: RawSql }): Promise<M240Check[]> {
  const out: M240Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const state = async () => (await c.rawSql(TEL_00247_STATE_SQL)).text
  const rows = async () => (await c.rawSql(`SELECT ${STATE_ROWS} r`)).text
  const before = await state()
  const st0 = JSON.parse(before)[0].f
  const applied = st0.applied === true
  add(`staging-tilstand læst (00247 ${applied ? 'anvendt' : 'IKKE anvendt → kroppen køres i prøven'})`, true)
  add('Management API-rollen kan skifte til service_role (ingest testes som service_role)', st0.sr_member === true)
  const rows0 = await rows()
  const { fx, cleanup } = await setup240(c)
  const stamp = randomUUID().slice(0, 8)
  const cid = (k: string) => `p247-${stamp}-${k}`
  try {
    const { loginPersonas } = await import('./role-matrix')
    const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
    const uid: Record<string, string> = {}
    for (const r of ['admin', 'serviceleder', 'bogholderi']) uid[r] = (await p.get(r as never)!.auth.getUser()).data.user!.id
    const A = uid.admin
    const SHA_A = 'a'.repeat(64), SHA_B = 'b'.repeat(64)
    const callId = (k: string) => `(SELECT id FROM public.telephony_calls WHERE provider = 'relatel' AND provider_call_id = '${cid(k)}')`
    // ing(event, call, type, at, dir, from, dur, answered, emp, sha, vm_duration) som service_role
    const ing = (ev: string, call: string, typ: string, at: string, opt: { dir?: string; from?: string; dur?: number; ans?: boolean; emp?: string; sha?: string; vmd?: number } = {}) =>
      `pg_temp.ing('${cid(ev)}', '${cid(call)}', '${typ}', ${at}, ${opt.dir === undefined ? `'inbound'` : opt.dir === 'null' ? 'NULL' : `'${opt.dir}'`}, '${opt.from ?? '4512345601'}', ${opt.dur ?? 'NULL'}, ${opt.ans === undefined ? 'NULL' : opt.ans}, ${opt.emp ? `'${opt.emp}'` : 'NULL'}, ${opt.sha ? `'${opt.sha}'` : 'NULL'}, ${opt.vmd ?? 'NULL'})`
    const t = (s: number) => `(v_t0 + interval '${s} seconds')`
    const set = (k: string, expr: string) => `res := jsonb_set(res, '{${k.replace('.', ',')}}', coalesce(to_jsonb(${expr}), 'null'::jsonb));`
    const match = (call: string, ver: number, action: 'confirm' | 'link_case' | 'reject', cust: string | null, kase: string | null, actor = A) =>
      `pg_temp.sr($q$SELECT outcome || ':' || coalesce(match_version::text, '') FROM public.telephony_set_call_match(${callId(call)}, ${ver}, '${action}', ${cust ? `'${cust}'` : 'NULL'}, ${kase ? `'${kase}'` : 'NULL'}, '${actor}')$q$)`
    const prj = (k: string) => `pg_temp.prj('${cid(k)}', v_t0)`
    const emp = `emp-${stamp}`

    // ---- personaer
    const ops: Record<(typeof WRITE_OPS)[number], string> = {
      ins_call: `INSERT INTO public.telephony_calls (provider, provider_call_id, from_number_normalized, started_at) VALUES ('relatel', 'p247-persona', '4511111111', now())`,
      upd_call: `UPDATE public.telephony_calls SET duration_seconds = 1 WHERE provider_call_id LIKE 'p247-${stamp}-%'`,
      del_call: `DELETE FROM public.telephony_calls WHERE provider_call_id LIKE 'p247-${stamp}-%'`,
      sel_events: `SELECT 1 FROM public.telephony_events LIMIT 1`,
      ins_event: `INSERT INTO public.telephony_events (call_id, provider, provider_event_id, event_type, schema_kind, occurred_at) VALUES (gen_random_uuid(), 'relatel', 'p247-persona', 'call.started', 'canonical', now())`,
      sel_links: `SELECT 1 FROM public.telephony_employee_links LIMIT 1`,
      exec_ingest: `SELECT * FROM public.telephony_ingest_event('relatel', 'p247-persona', 'p247-persona', 'call.started', 'canonical', now(), 'inbound', '4511111111', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
      exec_match: `SELECT * FROM public.telephony_set_call_match(gen_random_uuid(), 0, 'reject', NULL, NULL, gen_random_uuid())`,
      exec_purge: `SELECT public.telephony_purge_unconfirmed()`,
    }
    const opsArray = `ARRAY[${WRITE_OPS.map((k) => `$w$${ops[k]}$w$`).join(', ')}]`
    const ov = (profile: string, rws: Array<[string, 'grant' | 'revoke']>) =>
      `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${rws.map(([k, e]) => `('${profile}', '${k}', '${e}', 'manual', 'probe 247')`).join(',')};`
    const clearOv = (profile: string) => `DELETE FROM public.user_permission_overrides WHERE profile_id = '${profile}' AND reason = 'probe 247';`
    const v = (name: string, who: string, rws: Array<[string, 'grant' | 'revoke']>) =>
      `${ov(who, rws)}\n  res := jsonb_set(res, '{p,${name}}', pg_temp.p247('${who}'));\n  ${clearOv(who)}`

    const sql = `DO $probe$
DECLARE res jsonb := '{"i": {}, "m": {}, "r": {}, "p": {}}'::jsonb; v_t0 timestamptz := date_trunc('second', now()) - interval '2 hours'; v_tmp_cust uuid;
BEGIN
  res := jsonb_set(res, '{fp0}', to_jsonb(${FP}));
  ${applied ? `-- anvendt: en gentaget kørsel skal afvises af guarden
  BEGIN
    EXECUTE $mig$${migration00247Body()}$mig$;
    res := jsonb_set(res, '{rerun}', '"KØRTE (!)"');
  EXCEPTION WHEN OTHERS THEN res := jsonb_set(res, '{rerun}', to_jsonb(SQLERRM));
  END;` : `EXECUTE $mig$${migration00247Body()}$mig$;
  res := jsonb_set(res, '{fp_mig}', to_jsonb(${FP}));`}
  res := jsonb_set(res, '{g}', to_jsonb(${G_SQL}));
  res := jsonb_set(res, '{rows_before}', to_jsonb((SELECT json_build_object('calls', (SELECT count(*) FROM public.telephony_calls), 'old_unconfirmed', (SELECT count(*) FROM public.telephony_calls WHERE customer_id IS NULL AND coalesce(ended_at, started_at) < now() - interval '90 days')))));

  CREATE FUNCTION pg_temp.ing(ev text, cid text, typ text, at timestamptz, dir text, frm text, dur int, ans boolean, emp text, sha text, vmd int)
  RETURNS text LANGUAGE plpgsql AS $f$
  DECLARE o text;
  BEGIN
    BEGIN
      EXECUTE 'SET LOCAL ROLE service_role';
      SELECT x.outcome INTO o FROM public.telephony_ingest_event('relatel', ev, cid, typ, 'canonical', at, dir, frm, '4570000000', dur, ans, NULL, vmd, NULL, emp, sha) x;
      EXECUTE 'RESET ROLE';
    EXCEPTION WHEN OTHERS THEN o := 'ERR:' || SQLSTATE || '|' || translate(SQLERRM, '"', '');
    END;
    RETURN o;
  END $f$;
  CREATE FUNCTION pg_temp.sr(q text) RETURNS text LANGUAGE plpgsql AS $f$
  DECLARE o text;
  BEGIN
    BEGIN
      EXECUTE 'SET LOCAL ROLE service_role';
      EXECUTE q INTO o;
      EXECUTE 'RESET ROLE';
    EXCEPTION WHEN OTHERS THEN o := 'ERR:' || SQLSTATE || '|' || translate(SQLERRM, '"', '');
    END;
    RETURN coalesce(o, 'ok');
  END $f$;
  CREATE FUNCTION pg_temp.pg(q text) RETURNS text LANGUAGE plpgsql AS $f$
  DECLARE o text;
  BEGIN
    BEGIN EXECUTE q INTO o; EXCEPTION WHEN OTHERS THEN o := 'ERR:' || SQLSTATE || '|' || translate(SQLERRM, '"', ''); END;
    RETURN coalesce(o, 'ok');
  END $f$;
  CREATE FUNCTION pg_temp.prj(k text, t0 timestamptz) RETURNS jsonb LANGUAGE sql AS $f$
    SELECT jsonb_build_object('direction', c.direction, 'from', c.from_number_normalized, 'to', c.to_number_normalized,
      'ext', c.external_number_normalized, 'started', extract(epoch FROM c.started_at - t0), 'answered', extract(epoch FROM c.answered_at - t0),
      'ended', extract(epoch FROM c.ended_at - t0), 'dur', c.duration_seconds, 'status', c.status, 'missed', c.missed,
      'vm', c.has_voicemail, 'vmd', c.voicemail_duration_seconds, 'emp', c.provider_employee_id, 'prof', c.employee_profile_id,
      'match', c.match_status, 'cust', c.customer_id, 'case', c.service_case_id, 'sugg', c.suggested_customer_id, 'ver', c.match_version,
      'events', (SELECT count(*) FROM public.telephony_events e WHERE e.call_id = c.id))
    FROM public.telephony_calls c WHERE c.provider = 'relatel' AND c.provider_call_id = k
  $f$;
  CREATE FUNCTION pg_temp.p247(p_uid uuid, p_anon boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $f$
  DECLARE v jsonb; w jsonb := '[]'::jsonb; q text; n int;
  BEGIN
    BEGIN
      IF p_anon THEN
        EXECUTE 'SET LOCAL ROLE anon';
        PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      ELSE
        EXECUTE 'SET LOCAL ROLE authenticated';
        PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      END IF;
      BEGIN
        EXECUTE 'SELECT coalesce(jsonb_agg(x.provider_call_id ORDER BY x.provider_call_id), ''[]'') FROM public.telephony_calls x WHERE x.provider_call_id LIKE ''p247-${stamp}-%''' INTO v;
      EXCEPTION WHEN OTHERS THEN v := to_jsonb(SQLSTATE);
      END;
      FOREACH q IN ARRAY ${opsArray} LOOP
        BEGIN
          EXECUTE q; GET DIAGNOSTICS n = ROW_COUNT; w := w || to_jsonb('ok:' || n);
        EXCEPTION WHEN OTHERS THEN w := w || to_jsonb(SQLSTATE);
        END;
      END LOOP;
      RAISE EXCEPTION 'P247UNDO';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'P247UNDO' THEN RAISE; END IF;
    END;
    RETURN jsonb_build_object('vis', v, 'w', w);
  END $f$;

  -- ===== I: ingest =====
  ${set('i.dup1', ing('E1', 'X1', 'call.started', t(0), { sha: SHA_A }))}
  ${set('i.dup2', ing('E1', 'X1', 'call.started', t(0), { sha: SHA_A }))}
  ${set('i.dup_x1', prj('X1'))}
  ${set('i.dup_events', `(SELECT count(*) FROM public.telephony_events WHERE provider_event_id = '${cid('E1')}')`)}
  ${set('i.conflict_call', ing('E1', 'X1other', 'call.started', t(0), { sha: SHA_A }))}
  ${set('i.conflict_call_rows', `(SELECT count(*) FROM public.telephony_calls WHERE provider_call_id = '${cid('X1other')}')`)}
  ${set('i.conflict_hash', ing('E1', 'X1', 'call.started', t(0), { sha: SHA_B }))}
  ${set('i.dup_x1_after', prj('X1'))}
  -- tre rækkefølger af samme livscyklus
  ${set('i.oA1', ing('A-s', 'XA', 'call.started', t(0)))} ${set('i.oA2', ing('A-a', 'XA', 'call.answered', t(5), { emp: '101' }))} ${set('i.oA3', ing('A-e', 'XA', 'call.ended', t(125), { dur: 120, ans: true }))}
  ${set('i.oB1', ing('B-e', 'XB', 'call.ended', t(125), { dur: 120, ans: true }))} ${set('i.oB2', ing('B-a', 'XB', 'call.answered', t(5), { emp: '101' }))} ${set('i.oB3', ing('B-s', 'XB', 'call.started', t(0)))}
  ${set('i.oC1', ing('C-a', 'XC', 'call.answered', t(5), { emp: '101' }))} ${set('i.oC2', ing('C-e', 'XC', 'call.ended', t(125), { dur: 120, ans: true }))} ${set('i.oC3', ing('C-s', 'XC', 'call.started', t(0)))}
  ${set('i.XA', prj('XA'))} ${set('i.XB', prj('XB'))} ${set('i.XC', prj('XC'))}
  -- sen slut-hændelse
  ${ing('L-s', 'XL', 'call.started', t(0)).replace(/^/, 'PERFORM ')}; ${ing('L-a', 'XL', 'call.answered', t(3)).replace(/^/, 'PERFORM ')};
  ${set('i.XL_mid', prj('XL'))}
  ${ing('L-e', 'XL', 'call.ended', t(98), { dur: 95, ans: true }).replace(/^/, 'PERFORM ')};
  ${set('i.XL_end', prj('XL'))}
  -- ældre slut-hændelse (fx call.missed fra et andet ben) overskriver ikke slut/varighed
  ${ing('L-e-old', 'XL', 'call.ended', t(60), { dur: 50 }).replace(/^/, 'PERFORM ')};
  ${set('i.XL_old', prj('XL'))}
  -- ubesvaret ude af rækkefølge; telefonsvarer
  ${ing('M-m', 'XM', 'call.missed', t(30), { ans: false }).replace(/^/, 'PERFORM ')}; ${ing('M-s', 'XM', 'call.started', t(0)).replace(/^/, 'PERFORM ')};
  ${set('i.XM', prj('XM'))}
  ${ing('V-m', 'XV', 'call.missed', t(30), { ans: false }).replace(/^/, 'PERFORM ')}; ${ing('V-v', 'XV', 'voicemail.created', t(60), { vmd: 22 }).replace(/^/, 'PERFORM ')};
  ${set('i.XV', prj('XV'))}
  -- SMS afvises og efterlader intet opkald
  ${set('i.sms', ing('S-1', 'XS', 'sms.received', t(0)))}
  ${set('i.sms_rows', `(SELECT count(*) FROM public.telephony_calls WHERE provider_call_id = '${cid('XS')}')`)}
  -- DB-håndhævet unikhed: direkte dublet-INSERT (som postgres, uden funktionen)
  ${set('i.raw_dup', `pg_temp.pg($q$INSERT INTO public.telephony_events (call_id, provider, provider_event_id, event_type, schema_kind, occurred_at) SELECT id, 'relatel', '${cid('E1')}', 'call.ended', 'canonical', now() FROM public.telephony_calls WHERE provider_call_id = '${cid('X1')}' RETURNING 'indsat'$q$)`)}
  ${set('i.raw_dup_call', `pg_temp.pg($q$INSERT INTO public.telephony_calls (provider, provider_call_id, from_number_normalized, started_at) VALUES ('relatel', '${cid('X1')}', '4511111111', now()) RETURNING 'indsat'$q$)`)}
  -- uforanderlige hændelser (også for service_role)
  ${set('i.event_update', `pg_temp.sr($q$UPDATE public.telephony_events SET occurred_at = now() WHERE provider_event_id = '${cid('E1')}' RETURNING 'opdateret'$q$)`)}
  -- ingen kunde uden menneske: INSERT med kunde, direkte UPDATE af kunde/sag
  ${set('i.insert_with_customer', `pg_temp.sr($q$INSERT INTO public.telephony_calls (provider, provider_call_id, from_number_normalized, started_at, customer_id) VALUES ('relatel', '${cid('Xbad')}', '4511111111', now(), '${fx.cust.own}') RETURNING 'indsat'$q$)`)}
  ${set('i.update_customer', `pg_temp.sr($q$UPDATE public.telephony_calls SET customer_id = '${fx.cust.own}' WHERE provider_call_id = '${cid('X1')}' RETURNING 'opdateret'$q$)`)}
  ${set('i.update_customer_fake_human', `pg_temp.sr($q$UPDATE public.telephony_calls SET customer_id = '${fx.cust.own}', match_source = 'human', matched_by = '${A}' WHERE provider_call_id = '${cid('X1')}' RETURNING 'opdateret'$q$)`)}
  -- medarbejder-kobling
  ${set('i.link', `pg_temp.sr($q$INSERT INTO public.telephony_employee_links (provider, provider_employee_id, profile_id) VALUES ('relatel', '${emp}', '${fx.m.uid}') RETURNING 'ok'$q$)`)}
  ${set('i.link_dup_profile', `pg_temp.sr($q$INSERT INTO public.telephony_employee_links (provider, provider_employee_id, profile_id) VALUES ('relatel', '${emp}-2', '${fx.m.uid}') RETURNING 'ok'$q$)`)}
  ${ing('Ea-s', 'XE', 'call.started', t(0), { emp: 'ukendt' }).replace(/^/, 'PERFORM ')}; ${ing('Ea-a', 'XE', 'call.answered', t(4), { emp }).replace(/^/, 'PERFORM ')};
  ${set('i.XE', prj('XE'))}
  ${set('i.link_dup_id', `pg_temp.sr($q$INSERT INTO public.telephony_employee_links (provider, provider_employee_id, profile_id) VALUES ('relatel', '${emp}', '${fx.s.uid}') RETURNING 'ok'$q$)`)}
  -- ukendt medarbejder-id → ingen profil (intet gæt)
  ${ing('Eu-a', 'XU', 'call.answered', t(4), { emp: `ukendt-${stamp}` }).replace(/^/, 'PERFORM ')};
  ${set('i.XU', prj('XU'))}
  -- deaktiveret profil → ingen profil
  UPDATE public.profiles SET is_active = false WHERE id = '${fx.m.uid}';
  ${ing('Eg-a', 'XG', 'call.answered', t(4), { emp }).replace(/^/, 'PERFORM ')};
  UPDATE public.profiles SET is_active = true WHERE id = '${fx.m.uid}';
  ${set('i.XG', prj('XG'))}
  -- ændret kobling → nye opkald får den nye profil; gamle opkald beholder deres
  ${set('i.link_change', `pg_temp.sr($q$UPDATE public.telephony_employee_links SET profile_id = '${fx.s.uid}', updated_at = now() WHERE provider_employee_id = '${emp}' RETURNING 'ok'$q$)`)}
  ${ing('Eh-a', 'XH', 'call.answered', t(4), { emp }).replace(/^/, 'PERFORM ')};
  ${set('i.XH', prj('XH'))}
  ${set('i.XE_after', prj('XE'))}
  ${set('i.link_off', `pg_temp.sr($q$UPDATE public.telephony_employee_links SET is_active = false WHERE provider_employee_id = '${emp}' RETURNING 'ok'$q$)`)}
  ${ing('Eb-a', 'XF', 'call.answered', t(4), { emp }).replace(/^/, 'PERFORM ')};
  ${set('i.XF', prj('XF'))}
  res := jsonb_set(res, '{fp_ingest}', to_jsonb(${FP}));

  -- ===== P-fixtures (U/S/A/R/Ci/Cf) =====
  ${['U', 'S', 'A', 'R', 'Ci', 'Cf'].map((k, i) => ing(`${k}-fx`, k, 'call.missed', t(10 + i), { ans: false, from: `45123456${10 + i}` }).replace(/^/, 'PERFORM ') + ';').join(' ')}
  UPDATE public.telephony_calls SET match_status = 'suggested', suggested_customer_id = '${fx.cust.own}', candidate_count = 1 WHERE provider_call_id = '${cid('S')}';
  UPDATE public.telephony_calls SET match_status = 'ambiguous', suggested_customer_id = '${fx.cust.own}', candidate_count = 2 WHERE provider_call_id = '${cid('A')}';
  ${set('m.ambiguous', prj('A'))}
  ${set('m.reject_R', match('R', 0, 'reject', null, null))}
  ${set('m.confirm_Ci', match('Ci', 0, 'confirm', fx.cust.own, null))}
  ${set('m.confirm_Cf', match('Cf', 0, 'confirm', fx.cust.hidden, null))}
  ${set('m.link_Cf', match('Cf', 1, 'link_case', fx.cust.hidden, fx.cases.hidden))}

  -- ===== M: match/rettelse på XA =====
  ${set('m.c1', match('XA', 0, 'confirm', fx.cust.own, null))}
  ${set('m.c1_again', match('XA', 0, 'confirm', fx.cust.hidden, null))}
  ${set('m.wrong_case', match('XA', 1, 'link_case', fx.cust.own, fx.cases.hidden))}
  ${set('m.confirm_with_case', match('XA', 1, 'confirm', fx.cust.hidden, fx.cases.hidden))}
  ${set('m.link_not_confirmed', match('XB', 0, 'link_case', fx.cust.own, fx.cases.hidden))}
  ${set('m.c2', match('XA', 1, 'confirm', fx.cust.hidden, null))}
  ${set('m.l3', match('XA', 2, 'link_case', fx.cust.hidden, fx.cases.hidden))}
  ${set('m.c2_prj', prj('XA'))}
  ${set('m.unchanged', match('XA', 3, 'link_case', fx.cust.hidden, fx.cases.hidden))}
  ${set('m.u4', match('XA', 3, 'link_case', fx.cust.hidden, null))}
  ${set('m.l5', match('XA', 4, 'link_case', fx.cust.hidden, fx.cases.hidden))}
  ${set('m.c6', match('XA', 5, 'confirm', fx.cust.own, null))}
  ${set('m.c6_prj', prj('XA'))}
  ${set('m.r3', match('XA', 6, 'reject', null, null))}
  ${set('m.r3_prj', prj('XA'))}
  ${set('m.r_again', match('XA', 7, 'reject', null, null))}
  ${set('m.reject_with_customer', match('XB', 0, 'reject', fx.cust.own, null))}
  ${set('m.case_without_customer', match('XB', 0, 'confirm', null, fx.cases.hidden))}
  UPDATE public.profiles SET is_active = false WHERE id = '${fx.m.uid}';
  ${set('m.inactive_actor', match('XB', 0, 'confirm', fx.cust.own, null, fx.m.uid))}
  UPDATE public.profiles SET is_active = true WHERE id = '${fx.m.uid}';
  ${set('m.audit', `(SELECT jsonb_agg(action ORDER BY action) FROM public.audit_logs WHERE entity_type = 'telephony_call' AND entity_id = ${callId('XA')})`)}
  ${set('m.audit_numbers', `(SELECT count(*) FROM public.audit_logs WHERE entity_type = 'telephony_call' AND entity_id = ${callId('XA')} AND (changes::text LIKE '%4512345601%' OR metadata::text LIKE '%4512345601%'))`)}
  -- slettet kunde → ubekræftet, ingen sag
  INSERT INTO public.customers (customer_number, company_name, contact_person, email, created_by, custom_fields)
    VALUES ('HARN-247-${stamp}', '[HARNESS] 247', 'R', 'p247-${stamp}@harness.test', '${A}', '{"harness":"247"}') RETURNING id INTO v_tmp_cust;
  ${set('m.del_confirm', `pg_temp.sr($q$SELECT outcome FROM public.telephony_set_call_match(${callId('XC')}, 0, 'confirm', '$q$ || v_tmp_cust || $q$', NULL, '${A}')$q$)`)}
  DELETE FROM public.customers WHERE id = v_tmp_cust;
  ${set('m.del_prj', prj('XC'))}

  -- ===== R: retention =====
  ${ing('O-e', 'XO', 'call.missed', `(now() - interval '91 days')`, { ans: false }).replace(/^/, 'PERFORM ')};
  ${ing('Ok-e', 'XOk', 'call.missed', `(now() - interval '91 days')`, { ans: false }).replace(/^/, 'PERFORM ')};
  ${set('r.ok_confirm', match('XOk', 0, 'confirm', fx.cust.own, null))}
  ${ing('N-e', 'XN', 'call.missed', `(now() - interval '89 days')`, { ans: false }).replace(/^/, 'PERFORM ')};
  ${set('r.purged', `pg_temp.sr($q$SELECT public.telephony_purge_unconfirmed()::text$q$)`)}
  ${set('r.left', `(SELECT jsonb_object_agg(k, (SELECT count(*) FROM public.telephony_calls WHERE provider_call_id = 'p247-${stamp}-' || k)) FROM unnest(ARRAY['XO', 'XOk', 'XN']) k)`)}
  ${set('r.events_left', `(SELECT count(*) FROM public.telephony_events WHERE provider_event_id = '${cid('O-e')}')`)}

  -- ===== P: personaer =====
  res := jsonb_set(res, '{p}', '{}'::jsonb);
  ${['admin', 'serviceleder', 'bogholderi'].map((r) => `res := jsonb_set(res, '{p,${r}}', pg_temp.p247('${uid[r]}'));`).join('\n  ')}
  res := jsonb_set(res, '{p,salg}', pg_temp.p247('${fx.s.uid}'));
  res := jsonb_set(res, '{p,montor}', pg_temp.p247('${fx.m.uid}'));
  ${v('montor_grant_view', fx.m.uid, [['calls.view', 'grant']])}
  ${v('montor_grant_view_viewall', fx.m.uid, [['calls.view', 'grant'], ['customers.view.all', 'grant']])}
  ${v('bogholderi_grant_unmatched', uid.bogholderi, [['calls.view_unmatched', 'grant']])}
  ${v('salg_revoke_view', fx.s.uid, [['calls.view', 'revoke']])}
  ${v('serviceleder_revoke_unmatched', uid.serviceleder, [['calls.view_unmatched', 'revoke']])}
  ${ov(fx.m.uid, [['calls.view', 'grant'], ['calls.view_unmatched', 'grant'], ['customers.view.all', 'grant']])}
  UPDATE public.profiles SET is_active = false WHERE id = '${fx.m.uid}';
  res := jsonb_set(res, '{p,inaktiv}', pg_temp.p247('${fx.m.uid}'));
  UPDATE public.profiles SET is_active = true WHERE id = '${fx.m.uid}';
  ${clearOv(fx.m.uid)}
  res := jsonb_set(res, '{p,uden_profil}', pg_temp.p247('${randomUUID()}'));
  res := jsonb_set(res, '{p,anon}', pg_temp.p247(NULL, true));

  RAISE EXCEPTION 'P247RESULT%P247END', res::text;
END
$probe$;`
    const r = await c.rawSql(sql)
    const m = r.text.match(/P247RESULT([\s\S]*?)P247END/)
    if (r.ok || !m) {
      add('prøven kørte og blev rullet tilbage', false, r.ok ? 'blev IKKE afbrudt (!)' : r.text.slice(0, 1200))
      return out
    }
    add(`prøven kørte i én transaktion og blev rullet tilbage (${applied ? 'anvendt tilstand' : 'kroppen kørt i prøven = dry-run'})`, true)
    const res = JSON.parse(m[1].replace(/\\"/g, '"')) as Record<string, any>
    const j = (x: unknown) => JSON.stringify(x)
    const srt = (x: unknown) => (Array.isArray(x) ? [...x].sort() : x)
    // 'ERR:<kode>|<besked>' sammenlignes på koden; beskeden vises ved fejl
    const code = (x: unknown): unknown => typeof x === 'string' && x.startsWith('ERR:') ? x.split('|')[0] : Array.isArray(x) ? x.map(code) : x
    const eq = (id: string, got: unknown, want: unknown) => add(id, j(code(got)) === j(want), j(code(got)) === j(want) ? '' : `fik ${j(got)}, forventet ${j(want)}`)

    // ---- G
    const g = res.g
    eq('G: tre tabeller, RLS slået til på alle', srt(g.tables), ['telephony_calls:rls=true', 'telephony_employee_links:rls=true', 'telephony_events:rls=true'])
    add('G: præcis én politik (SELECT på telephony_calls, TO authenticated, effektive rettigheder, ingen USING (true)/user_role())',
      g.pol.length === 1 && /^telephony_calls:telephony_calls_select:SELECT:\{authenticated\}:/.test(g.pol[0]) && g.pol[0].includes("'calls.view_unmatched'") && !/user_role\(\)/.test(g.pol[0]) && !/:true:/.test(g.pol[0]), g.pol.join(' | ').slice(0, 200))
    eq('G: grants — authenticated kun SELECT på telephony_calls; intet til anon/PUBLIC; intet på hændelser/koblinger', g.grants, ['telephony_calls:authenticated:SELECT'])
    eq('G: ingen kolonne-skrivegrants til anon/authenticated', g.col_grants, 0)
    eq('G: funktioner kun EXECUTE for service_role', srt(g.fn), FNS.map((f) => `public.${f}:anon=false:auth=false:sr=true`).sort())
    eq('G: nøgler calls.match/view/view_unmatched', srt(g.keys), ['calls.match', 'calls.view', 'calls.view_unmatched'])
    eq('G: standarder (admin/serviceleder alle tre; salg view+match; montør/bogholderi ingen)', srt(g.defaults),
      ['admin:calls.match', 'admin:calls.view', 'admin:calls.view_unmatched', 'salg:calls.match', 'salg:calls.view', 'serviceleder:calls.match', 'serviceleder:calls.view', 'serviceleder:calls.view_unmatched'])
    const want = ['answered_at', 'candidate_count', 'created_at', 'customer_id', 'direction', 'duration_seconds', 'employee_profile_id', 'ended_at', 'external_number_normalized',
      'from_number_normalized', 'has_voicemail', 'id', 'match_source', 'match_status', 'match_version', 'matched_at', 'matched_by', 'missed', 'provider', 'provider_call_id',
      'provider_employee_id', 'provider_voicemail_id', 'service_case_id', 'started_at', 'status', 'suggested_customer_id', 'to_number_normalized', 'updated_at', 'voicemail_duration_seconds']
    eq('G: telephony_calls-kolonner (ingen lyd/URL/transskription/payload)', srt(g.cols), [...want].sort())
    if (applied) add('G: gentaget kørsel afvises af guarden (ingen dobbelt-anvendelse)', String(res.rerun).includes('findes allerede'), String(res.rerun).slice(0, 120))
    else add('dry-run: migrationskroppen ændrer ingen kunde-/sags-/opgave-/audit-/mail-/override-data', j(res.fp0) === j(res.fp_mig))
    eq('udgangspunkt: 0 opkald og 0 gamle ubekræftede i tabellen (prøven ser kun egne rækker)', res.rows_before, { calls: 0, old_unconfirmed: 0 })

    // ---- I
    const i = res.i
    eq('I1 samme hændelse 2× → created, duplicate', [i.dup1, i.dup2], ['created', 'duplicate'])
    eq('I1 … præcis én hændelse og ét opkald', [i.dup_events, i.dup_x1?.events], [1, 1])
    eq('I2 samme hændelses-id med ANDET opkald → conflict, intet nyt opkald', [i.conflict_call, i.conflict_call_rows], ['conflict', 0])
    eq('I2 samme hændelses-id med anden payload-hash → conflict', i.conflict_hash, 'conflict')
    add('I2 … opkaldet uændret efter dubletter/konflikter', j(i.dup_x1) === j(i.dup_x1_after))
    eq('I3 alle livscyklus-hændelser accepteret i alle tre rækkefølger', [i.oA1, i.oA2, i.oA3, i.oB1, i.oB2, i.oB3, i.oC1, i.oC2, i.oC3], Array(9).fill('created'))
    add('I3 started→answered→ended = ended→answered→started = answered→ended→started (identisk slutrække)', j(i.XA) === j(i.XB) && j(i.XA) === j(i.XC), `${j(i.XA)} | ${j(i.XB)} | ${j(i.XC)}`.slice(0, 400))
    eq('I3 … korrekt tilstand: start 0 s, svar 5 s, slut 125 s, 120 s, ended, ikke ubesvaret, medarbejder 101, 3 hændelser',
      [i.XA?.started, i.XA?.answered, i.XA?.ended, i.XA?.dur, i.XA?.status, i.XA?.missed, i.XA?.emp, i.XA?.events, i.XA?.match, i.XA?.cust], [0, 5, 125, 120, 'ended', false, '101', 3, 'unmatched', null])
    eq('I4 før slut-hændelsen: answered uden slut/varighed', [i.XL_mid?.status, i.XL_mid?.ended, i.XL_mid?.dur], ['answered', null, null])
    eq('I4 sen slut-hændelse opdaterer varighed og status', [i.XL_end?.status, i.XL_end?.ended, i.XL_end?.dur], ['ended', 98, 95])
    eq('I4 ældre slut-hændelse overskriver ikke slut/varighed (monoton)', [i.XL_old?.status, i.XL_old?.ended, i.XL_old?.dur, i.XL_old?.events], ['ended', 98, 95, 4])
    eq('I5 ubesvaret modtaget før start → missed, start 0 s, slut 30 s', [i.XM?.status, i.XM?.missed, i.XM?.started, i.XM?.ended, i.XM?.answered], ['missed', true, 0, 30, null])
    eq('I5 telefonsvarer → voicemail, ubesvaret, kun metadata (varighed 22 s)', [i.XV?.status, i.XV?.missed, i.XV?.vm, i.XV?.vmd], ['voicemail', true, true, 22])
    eq('I6 SMS afvises (23514) og efterlader intet opkald', [i.sms, i.sms_rows], ['ERR:23514', 0])
    eq('I7 unikhed håndhævet af DB: direkte dublet-hændelse → 23505, dublet-opkald → 23505', [i.raw_dup, i.raw_dup_call], ['ERR:23505', 'ERR:23505'])
    eq('I8 hændelser er uforanderlige (UPDATE som service_role → 55000)', i.event_update, 'ERR:55000')
    eq('I9 opkald kan ikke oprettes med kunde (23514); kunde kan ikke sættes uden bekræftelse/ny version (42501)', [i.insert_with_customer, i.update_customer, i.update_customer_fake_human], ['ERR:23514', 'ERR:42501', 'ERR:42501'])
    eq('I10 medarbejder-kobling: én aktiv kobling pr. profil (23505); samme udbyder-id to gange afvises (23505)', [i.link, i.link_dup_profile, i.link_dup_id], ['ok', 'ERR:23505', 'ERR:23505'])
    eq('I10 ukendt medarbejder-id → ingen profil (intet gæt)', [i.XU?.emp, i.XU?.prof], [`ukendt-${stamp}`, null])
    eq('I10 deaktiveret profil → ingen profil', [i.XG?.emp, i.XG?.prof], [`emp-${stamp}`, null])
    eq('I10 ændret kobling → nye opkald får ny profil; gamle beholder deres', [i.link_change, i.XH?.prof, i.XE_after?.prof], ['ok', fx.s.uid, fx.m.uid])
    eq('I10 den der svarer vinder; aktiv kobling → profil', [i.XE?.emp, i.XE?.prof], [`emp-${stamp}`, fx.m.uid])
    eq('I10 inaktiv kobling → ingen profil', [i.link_off, i.XF?.emp, i.XF?.prof], ['ok', `emp-${stamp}`, null])
    add('I11 ingest rører ikke kunder, sager, opgaver, audit_logs, mails eller overrides (md5 før = efter)', j(applied ? res.fp0 : res.fp_mig) === j(res.fp_ingest), j(res.fp_ingest).slice(0, 200))

    // ---- M
    const mm = res.m
    eq('M1 tvetydigt match bærer aldrig et forslag (tvinges NULL)', [mm.ambiguous?.match, mm.ambiguous?.sugg], ['ambiguous', null])
    eq('M2 bekræft v0 → confirmed:1; samme version igen → stale', [mm.c1, mm.c1_again], ['confirmed:1', 'stale:1'])
    eq('M3 sag fra en anden kunde → 23514; bekræftelse med sag → 22023 (separate handlinger); sag på ubekræftet opkald → stale', [mm.wrong_case, mm.confirm_with_case, mm.link_not_confirmed], ['ERR:23514', 'ERR:22023', 'stale:0'])
    eq('M4 ret kunde v1 → corrected:2; sag v2 → case_linked:3; samme sag → unchanged; fjern sag → case_unlinked:4', [mm.c2, mm.l3, mm.c2_prj?.cust, mm.c2_prj?.case, mm.c2_prj?.match, mm.unchanged, mm.u4], ['corrected:2', 'case_linked:3', fx.cust.hidden, fx.cases.hidden, 'confirmed', 'unchanged:3', 'case_unlinked:4'])
    eq('M4 rettet kunde fjerner den tidligere sag', [mm.l5, mm.c6, mm.c6_prj?.cust, mm.c6_prj?.case], ['case_linked:5', 'corrected:6', fx.cust.own, null])
    eq('M5 fjern forkert match v6 → rejected:7 (ingen kunde/sag/forslag); igen → unchanged', [mm.r3, mm.r3_prj?.match, mm.r3_prj?.cust, mm.r3_prj?.case, mm.r3_prj?.sugg, mm.r_again], ['rejected:7', 'rejected', null, null, null, 'unchanged:7'])
    eq('M6 afvisning med kunde / sag uden kunde → 22023; inaktiv bruger → 42501', [mm.reject_with_customer, mm.case_without_customer, mm.inactive_actor], ['ERR:22023', 'ERR:22023', 'ERR:42501'])
    eq('M7 audit pr. ændring (stale/unchanged/fejl auditeres ikke)', mm.audit, ['call_case_linked', 'call_case_linked', 'call_case_unlinked', 'call_match_confirmed', 'call_match_corrected', 'call_match_corrected', 'call_match_rejected'])
    eq('M7 audit indeholder ingen telefonnumre', mm.audit_numbers, 0)
    eq('M8 slettet kunde → opkaldet ubekræftet uden sag (sletningen lykkes)', [mm.del_confirm, mm.del_prj?.cust, mm.del_prj?.case, mm.del_prj?.match], ['confirmed', null, null, 'unmatched'])
    eq('M9 fixtures: R afvist, Ci/Cf bekræftet, Cf koblet til sag', [mm.reject_R, mm.confirm_Ci, mm.confirm_Cf, mm.link_Cf], ['rejected:1', 'confirmed:1', 'confirmed:1', 'case_linked:2'])

    // ---- R
    eq('R1 retention: kun ubekræftet > 90 dage slettes (1); bekræftet > 90 dage og ubekræftet 89 dage bevares', [res.r.ok_confirm, res.r.purged, res.r.left], ['confirmed:1', '1', { XN: 1, XO: 0, XOk: 1 }])
    eq('R1 … hændelser følger med (kaskade)', res.r.events_left, 0)

    // ---- P
    const label = (x: string) => x.replace(`p247-${stamp}-`, '')
    for (const [k, w] of Object.entries(WANT_VIS)) {
      const cell = res.p?.[k]
      if (!cell) { add(`P ${k}`, false, 'mangler'); continue }
      const got = Array.isArray(cell.vis) ? (cell.vis as string[]).map(label).filter((x) => (P as readonly string[]).includes(x)).sort().join(',') : String(cell.vis).replace(/"/g, '')
      const writesBlocked = (cell.w as string[]).every((x) => x === '42501')
      add(`P ${k}: ser [${got || '—'}]; skriv/hændelser/koblinger/funktioner ${writesBlocked ? '42501' : (cell.w as string[]).join(',')}`, got === w && writesBlocked && (cell.w as string[]).length === WRITE_OPS.length,
        got === w ? (writesBlocked ? '' : `forventet 42501 på alle ${WRITE_OPS.join(',')}`) : `forventet [${w || '—'}]`)
    }

    // ---- C: samtidighed (kun når anvendt; rigtige parallelle sessioner)
    if (applied) await runConcurrency(c, add, { stamp, own: fx.cust.own, hidden: fx.cust.hidden, actor: A })
    else add('C: samtidighedstest springes over (00247 ikke anvendt — kører efter apply)', true)
    return out
  } finally {
    const left = await cleanup()
    add('oprydning: 0 testkunder tilbage', left === 0, `tilbage=${left}`)
    const after = await state()
    add('staging-tilstand identisk før/efter prøven (politikker, grants, ACL, katalog, data-md5 inkl. audit_logs)', after === before, after === before ? '' : after.slice(0, 300))
    const rows1 = await rows()
    add('telefoni-tabellernes rækketal identiske før/efter prøven', rows1 === rows0, `${rows0} → ${rows1}`)
  }
}

async function runConcurrency(c: { rawSql: RawSql }, add: (id: string, ok: boolean, note?: string) => void, o: { stamp: string; own: string; hidden: string; actor: string }) {
  const id = (k: string) => `p247c-${o.stamp}-${k}`
  const at = new Date(Date.now() + 4000).toISOString()
  const wait = `SELECT pg_sleep(greatest(0, extract(epoch FROM ('${at}'::timestamptz - clock_timestamp()))));`
  // ingest holder låsene 1,5 s efter indsættelse (samme transaktion), så de andre sessioner rammer den uafsluttede række
  const ingest = (ev: string, call: string, typ: string, offset: number, dur: string) => `${wait}
    WITH r AS (SELECT * FROM public.telephony_ingest_event('relatel', '${id(ev)}', '${id(call)}', '${typ}', 'canonical', '${at}'::timestamptz + interval '${offset} seconds',
      'inbound', '4512345699', '4570000000', ${dur}, ${typ === 'call.ended' ? 'true' : 'NULL'}, NULL, NULL, NULL, NULL, NULL))
    SELECT r.outcome, (SELECT 1 FROM pg_sleep(1.5)) AS s FROM r;`
  const outcome = (txt: string) => { try { const v = JSON.parse(txt); const row = Array.isArray(v) ? (Array.isArray(v[v.length - 1]) ? v[v.length - 1][0] : v[0]) : null; return String(row?.outcome ?? txt.slice(0, 80)) } catch { return txt.slice(0, 80) } }
  try {
    const same = await Promise.all(Array.from({ length: 8 }, () => c.rawSql(ingest('E', 'K1', 'call.started', 0, 'NULL'))))
    const o1 = same.map((r) => outcome(r.text)).sort()
    const cnt = async (q: string) => { const r = await c.rawSql(q); try { return JSON.parse(r.text)[0] } catch { return r.text.slice(0, 120) } }
    const k1 = await cnt(`SELECT (SELECT count(*)::int FROM public.telephony_calls WHERE provider_call_id = '${id('K1')}') calls, (SELECT count(*)::int FROM public.telephony_events WHERE provider_event_id = '${id('E')}') events`)
    add('C1 8 samtidige identiske webhook-forsøg → 1 created + 7 duplicate', j2(o1) === j2(['created', ...Array(7).fill('duplicate')].sort()), o1.join(','))
    add('C1 … præcis 1 opkald og 1 hændelse', k1.calls === 1 && k1.events === 1, JSON.stringify(k1))

    const mix: Array<[string, string, number, string]> = [['s', 'call.started', 0, 'NULL'], ['a', 'call.answered', 5, 'NULL'], ['e', 'call.ended', 125, '120']]
    const reqs = mix.flatMap(([ev, typ, off, dur]) => Array.from({ length: 3 }, () => c.rawSql(ingest(`K2-${ev}`, 'K2', typ, off, dur))))
    const o2 = (await Promise.all(reqs)).map((r) => outcome(r.text))
    const k2 = await cnt(`SELECT count(*)::int calls, max(c.status) status, max(c.duration_seconds) dur, max(extract(epoch FROM c.answered_at - c.started_at))::int ans, max(extract(epoch FROM c.ended_at - c.started_at))::int ended,
      (SELECT count(*)::int FROM public.telephony_events e WHERE e.provider_event_id LIKE '${id('K2-')}%') events FROM public.telephony_calls c WHERE c.provider_call_id = '${id('K2')}'`)
    add('C2 3 hændelser × 3 samtidige gentagelser for nyt opkald → 3 created + 6 duplicate', o2.filter((x) => x === 'created').length === 3 && o2.filter((x) => x === 'duplicate').length === 6, o2.join(','))
    add('C2 … 1 opkald, 3 hændelser, ended, 120 s, svar +5 s, slut +125 s', k2.calls === 1 && k2.events === 3 && k2.status === 'ended' && k2.dur === 120 && k2.ans === 5 && k2.ended === 125, JSON.stringify(k2))

    const at2 = new Date(Date.now() + 3000).toISOString()
    const wait2 = `SELECT pg_sleep(greatest(0, extract(epoch FROM ('${at2}'::timestamptz - clock_timestamp()))));`
    const fix = (cust: string) => `${wait2}
      WITH r AS (SELECT * FROM public.telephony_set_call_match((SELECT id FROM public.telephony_calls WHERE provider_call_id = '${id('K2')}'), 0, 'confirm', '${cust}', NULL, '${o.actor}'))
      SELECT r.outcome, (SELECT 1 FROM pg_sleep(1)) AS s FROM r;`
    const o3 = (await Promise.all([c.rawSql(fix(o.own)), c.rawSql(fix(o.hidden))])).map((r) => outcome(r.text)).sort()
    const k3 = await cnt(`SELECT (SELECT match_version FROM public.telephony_calls WHERE provider_call_id = '${id('K2')}') ver,
      (SELECT count(*)::int FROM public.audit_logs WHERE entity_type = 'telephony_call' AND entity_id = (SELECT id FROM public.telephony_calls WHERE provider_call_id = '${id('K2')}')) audit`)
    add('C3 2 samtidige rettelser med samme version → 1 confirmed + 1 stale', j2(o3) === j2(['confirmed', 'stale']), o3.join(','))
    add('C3 … version 1 og præcis 1 audit-række', k3.ver === 1 && k3.audit === 1, JSON.stringify(k3))
  } finally {
    await c.rawSql(`DELETE FROM public.audit_logs WHERE entity_type = 'telephony_call' AND entity_id IN (SELECT id FROM public.telephony_calls WHERE provider_call_id LIKE 'p247c-${o.stamp}-%');
      DELETE FROM public.telephony_calls WHERE provider_call_id LIKE 'p247c-${o.stamp}-%';`)
    const left = await c.rawSql(`SELECT (SELECT count(*)::int FROM public.telephony_calls WHERE provider_call_id LIKE 'p247c-%') calls, (SELECT count(*)::int FROM public.telephony_events WHERE provider_event_id LIKE 'p247c-%') events`)
    add('C: samtidigheds-rækker slettet igen (0 opkald, 0 hændelser, audit fjernet)', /"calls":0,"events":0/.test(left.text), left.text.slice(0, 120))
  }
}
const j2 = (x: unknown) => JSON.stringify(x)
