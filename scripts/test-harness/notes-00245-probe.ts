/**
 * 00245 customer_notes — staging-prøver.
 *   notes-00245-state  (read-only)     fingeraftryk: politikker, grants, nøgle, noter/case_notes (md5) — før/efter apply
 *   notes-00245-probe  (ROLLBACK-ONLY) I ÉN DO-blok der ALTID slutter med RAISE EXCEPTION:
 *     A) tabellen som den er på staging (00245 anvendt) → persona-matrix
 *     B) prod-stien: tabellen + case_notes.source + nøglen fjernes i transaktionen, 00245-kroppen køres igen → samme matrix
 * Pr. persona (rigtige uid'er, SET LOCAL ROLE authenticated + request.jwt.claims): synlige noter (i scope / fremmed),
 * INSERT (egen kunde / fremmed kunde / falsk created_by / source=system), DELETE (egen / andens / fremmed), UPDATE
 * (andens content / flyt kunde = kolonne-grant). Krav: Henrik 2026-11-02 (ingen USING (true), effektive rettigheder,
 * inaktiv/manglende profil = intet, grants/revokes pr. medarbejder virker, ingen eksisterende data ændret).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { setup240, type M240Check } from './mp-00240-scope-check'

type RawSql = (sql: string) => Promise<{ ok: boolean; status: number; text: string }>

export const NOTES_00245_STATE_SQL = `SELECT json_build_object(
  'table', to_regclass('public.customer_notes')::text,
  'pol', (SELECT json_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_notes'),
  'tblgrants', (SELECT json_agg(grantee || ':' || privilege_type ORDER BY grantee, privilege_type) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'customer_notes' AND grantee IN ('anon', 'authenticated', 'PUBLIC')),
  'colgrants', (SELECT json_agg(grantee || ':' || privilege_type || ':' || column_name ORDER BY grantee, privilege_type, column_name) FROM information_schema.column_privileges WHERE table_schema = 'public' AND table_name = 'customer_notes' AND grantee IN ('anon', 'authenticated') AND privilege_type = 'UPDATE'),
  'manage_defaults', (SELECT json_agg(role ORDER BY role) FROM public.role_permission_defaults WHERE permission = 'customers.notes.manage'),
  'case_notes_source', (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'case_notes' AND column_name = 'source'),
  'notes', (SELECT json_build_object('n', count(*), 'md5', md5(coalesce(string_agg(to_jsonb(n)::text, '|' ORDER BY n.id), ''))) FROM public.customer_notes n),
  'case_notes', (SELECT json_build_object('n', count(*), 'md5', md5(coalesce(string_agg(to_jsonb(c)::text, '|' ORDER BY c.id), ''))) FROM public.case_notes c)) f`

/** 00245-kroppen (mellem BEGIN; og COMMIT;) — samme tekst som anvendes */
export function migration00245Body(): string {
  const sql = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '00245_customer_notes_effective_permissions.sql'), 'utf8').replace(/\r\n/g, '\n')
  const a = sql.indexOf('\nBEGIN;\n'), b = sql.indexOf('\nCOMMIT;\n')
  if (a < 0 || b < a) throw new Error('00245: har ikke BEGIN; … COMMIT;')
  const body = sql.slice(a + '\nBEGIN;\n'.length, b)
  if (body.includes('$mig$')) throw new Error('00245: indeholder $mig$')
  return body
}

type Cell = { vis: string[]; ins_scope: string; ins_foreign: string; ins_spoof: string; ins_system: string; del_own: number | string; del_other: number | string; del_foreign: number | string; upd_other: number | string; upd_move: string }

export async function runNotes00245Probe(c: { admin: SupabaseClient; url: string; anonKey: string; rawSql: RawSql }): Promise<M240Check[]> {
  const out: M240Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const state = async () => (await c.rawSql(NOTES_00245_STATE_SQL)).text
  const before = await state()
  add('00245 anvendt på staging (customers.notes.manage-standarder findes)', /"manage_defaults"\s*:\s*\["admin","serviceleder"\]/.test(before), before.slice(0, 160))
  const { fx, cleanup } = await setup240(c)
  try {
    const { loginPersonas } = await import('./role-matrix')
    const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
    const uid: Record<string, string> = {}
    for (const r of ['admin', 'serviceleder', 'bogholderi']) uid[r] = (await p.get(r as never)!.auth.getUser()).data.user!.id
    const nA = randomUUID(), nH = randomUUID()
    const label = new Map([[nA, 'i_scope'], [nH, 'fremmed']])
    const own = fx.cust.own, foreign = fx.cust.hidden
    // fixtures som postgres (uden RLS): en andens note på montørens kunde og på en fremmed kunde (created_by NULL = ingen ejer)
    const seed = `INSERT INTO public.customer_notes (id, customer_id, content, source, created_by) VALUES
      ('${nA}', '${own}', '[PROBE] 245 i scope', 'manual', NULL), ('${nH}', '${foreign}', '[PROBE] 245 fremmed', 'manual', NULL);`
    const ov = (profile: string, rows: Array<[string, 'grant' | 'revoke']>) =>
      `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${rows.map(([k, e]) => `('${profile}', '${k}', '${e}', 'manual', 'probe 245')`).join(',')};`
    const clearOv = (profile: string) => `DELETE FROM public.user_permission_overrides WHERE profile_id = '${profile}';`
    const std = `jsonb_build_object('admin', pg_temp.p245('${uid.admin}'), 'serviceleder', pg_temp.p245('${uid.serviceleder}'),
        'bogholderi', pg_temp.p245('${uid.bogholderi}'), 'salg', pg_temp.p245('${fx.s.uid}'), 'montor', pg_temp.p245('${fx.m.uid}'))`
    const variants = (k: string) => `
  res := jsonb_set(res, '{${k}}', ${std});
  ${ov(fx.m.uid, [['customers.edit', 'grant']])}
  res := jsonb_set(res, '{${k},montor_grant_edit}', pg_temp.p245('${fx.m.uid}'));
  ${clearOv(fx.m.uid)}
  ${ov(fx.m.uid, [['customers.view.all', 'grant']])}
  res := jsonb_set(res, '{${k},montor_grant_view_all}', pg_temp.p245('${fx.m.uid}'));
  ${clearOv(fx.m.uid)}
  ${ov(fx.m.uid, [['customers.edit', 'grant'], ['customers.notes.manage', 'grant']])}
  res := jsonb_set(res, '{${k},montor_grant_edit_manage}', pg_temp.p245('${fx.m.uid}'));
  ${clearOv(fx.m.uid)}
  ${ov(fx.s.uid, [['customers.edit', 'revoke']])}
  res := jsonb_set(res, '{${k},salg_revoke_edit}', pg_temp.p245('${fx.s.uid}'));
  ${clearOv(fx.s.uid)}
  ${ov(fx.s.uid, [['customers.notes.manage', 'grant']])}
  res := jsonb_set(res, '{${k},salg_grant_manage}', pg_temp.p245('${fx.s.uid}'));
  ${clearOv(fx.s.uid)}
  ${ov(uid.serviceleder, [['customers.notes.manage', 'revoke']])}
  res := jsonb_set(res, '{${k},serviceleder_revoke_manage}', pg_temp.p245('${uid.serviceleder}'));
  ${clearOv(uid.serviceleder)}
  ${ov(fx.m.uid, [['customers.edit', 'grant']])}
  UPDATE public.profiles SET is_active = false WHERE id = '${fx.m.uid}';
  res := jsonb_set(res, '{${k},inaktiv}', pg_temp.p245('${fx.m.uid}'));
  UPDATE public.profiles SET is_active = true WHERE id = '${fx.m.uid}';
  ${clearOv(fx.m.uid)}
  res := jsonb_set(res, '{${k},uden_profil}', pg_temp.p245('${randomUUID()}'));
  res := jsonb_set(res, '{${k},anon}', pg_temp.p245(NULL, true));`
    const sql = `DO $probe$
DECLARE res jsonb := '{}'::jsonb;
BEGIN
  CREATE FUNCTION pg_temp.p245(p_uid uuid, p_anon boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $f$
  DECLARE r jsonb := '{}'::jsonb; v jsonb; n int; own_id uuid := gen_random_uuid();
  BEGIN
    BEGIN
      -- egen note (som postgres) til slet-tjekket; alt i denne blok rulles tilbage til sidst (P245UNDO)
      IF p_uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_uid) THEN
        INSERT INTO public.customer_notes (id, customer_id, content, source, created_by) VALUES (own_id, '${own}', '[PROBE] 245 egen', 'manual', p_uid);
      END IF;
      IF p_anon THEN
        EXECUTE 'SET LOCAL ROLE anon';
        PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      ELSE
        EXECUTE 'SET LOCAL ROLE authenticated';
        PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      END IF;
      BEGIN
        EXECUTE 'SELECT coalesce(jsonb_agg(x.id ORDER BY x.id), ''[]'') FROM public.customer_notes x WHERE x.id IN (''${nA}'', ''${nH}'')' INTO v;
        r := r || jsonb_build_object('vis', v);
      EXCEPTION WHEN insufficient_privilege THEN r := r || jsonb_build_object('vis', '[]'::jsonb);
      END;
      BEGIN
        EXECUTE format('INSERT INTO public.customer_notes (customer_id, content, source, created_by) VALUES (%L, %L, %L, %L)', '${own}', '[PROBE] 245 ny', 'manual', p_uid);
        r := r || jsonb_build_object('ins_scope', 'ok');
      EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('ins_scope', SQLSTATE);
      END;
      BEGIN
        EXECUTE format('INSERT INTO public.customer_notes (customer_id, content, source, created_by) VALUES (%L, %L, %L, %L)', '${foreign}', '[PROBE] 245 ny', 'manual', p_uid);
        r := r || jsonb_build_object('ins_foreign', 'ok');
      EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('ins_foreign', SQLSTATE);
      END;
      BEGIN
        EXECUTE format('INSERT INTO public.customer_notes (customer_id, content, source, created_by) VALUES (%L, %L, %L, %L)', '${own}', '[PROBE] 245 falsk', 'manual', '${uid.admin}');
        r := r || jsonb_build_object('ins_spoof', CASE WHEN p_uid = '${uid.admin}' THEN 'self' ELSE 'ok' END);
      EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('ins_spoof', SQLSTATE);
      END;
      BEGIN
        EXECUTE format('INSERT INTO public.customer_notes (customer_id, content, source, created_by) VALUES (%L, %L, %L, %L)', '${own}', '[PROBE] 245 system', 'system', p_uid);
        r := r || jsonb_build_object('ins_system', 'ok');
      EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('ins_system', SQLSTATE);
      END;
      BEGIN
        EXECUTE format('UPDATE public.customer_notes SET content = %L WHERE id = %L', '[PROBE] 245 rettet', '${nA}');
        GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('upd_other', n);
      EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('upd_other', SQLSTATE);
      END;
      BEGIN
        EXECUTE format('UPDATE public.customer_notes SET customer_id = %L WHERE id = %L', '${foreign}', own_id);
        GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('upd_move', n::text);
      EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('upd_move', SQLSTATE);
      END;
      BEGIN
        EXECUTE format('DELETE FROM public.customer_notes WHERE id = %L', own_id);
        GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('del_own', n);
      EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('del_own', SQLSTATE);
      END;
      BEGIN
        EXECUTE format('DELETE FROM public.customer_notes WHERE id = %L', '${nA}');
        GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('del_other', n);
      EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('del_other', SQLSTATE);
      END;
      BEGIN
        EXECUTE format('DELETE FROM public.customer_notes WHERE id = %L', '${nH}');
        GET DIAGNOSTICS n = ROW_COUNT; r := r || jsonb_build_object('del_foreign', n);
      EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('del_foreign', SQLSTATE);
      END;
      RAISE EXCEPTION 'P245UNDO';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'P245UNDO' THEN RAISE; END IF;
    END;
    RETURN r;
  END $f$;
  ${seed}
  -- A) staging som den er (00245 anvendt)
  ${variants('a')}
  -- service_role (kontrollerede server-stier, fx assistenten): læs, opret med source=assistant på enhver kunde, ret, slet
  DECLARE sv jsonb := '{}'::jsonb; n int;
  BEGIN
    BEGIN
      EXECUTE 'SET LOCAL ROLE service_role';
      EXECUTE 'SELECT count(*) FROM public.customer_notes WHERE id IN (''${nA}'', ''${nH}'')' INTO n;
      sv := sv || jsonb_build_object('read', n);
      EXECUTE format('INSERT INTO public.customer_notes (customer_id, content, source, created_by) VALUES (%L, %L, %L, %L)', '${foreign}', '[PROBE] 245 assistent', 'assistant', '${uid.admin}');
      sv := sv || jsonb_build_object('insert', 'ok');
      EXECUTE format('UPDATE public.customer_notes SET customer_id = %L WHERE id = %L', '${own}', '${nH}');
      GET DIAGNOSTICS n = ROW_COUNT; sv := sv || jsonb_build_object('update', n);
      EXECUTE format('DELETE FROM public.customer_notes WHERE id = %L', '${nA}');
      GET DIAGNOSTICS n = ROW_COUNT; sv := sv || jsonb_build_object('delete', n);
      RAISE EXCEPTION 'P245UNDO';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'P245UNDO' THEN RAISE; END IF;
    WHEN OTHERS THEN sv := sv || jsonb_build_object('error', SQLSTATE || ' ' || SQLERRM);
    END;
    res := jsonb_set(res, '{service_role}', sv);
  END;
  -- fingeraftryk før prod-stien (kunder, sager, case_notes uden source, noter)
  res := jsonb_set(res, '{fp_before}', jsonb_build_object(
    'customers', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.customers x),
    'service_cases', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.service_cases x),
    'case_notes', (SELECT md5(coalesce(string_agg((to_jsonb(x) - 'source')::text, '|' ORDER BY x.id), '')) FROM public.case_notes x),
    'customer_notes', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.customer_notes x)));
  -- B) prod-stien: ingen tabel, ingen case_notes.source, ingen nøgle → 00245-kroppen igen
  DROP TABLE public.customer_notes;
  ALTER TABLE public.case_notes DROP COLUMN source;
  DELETE FROM public.user_permission_overrides WHERE permission = 'customers.notes.manage';
  DELETE FROM public.role_permission_defaults WHERE permission = 'customers.notes.manage';
  DELETE FROM public.permission_catalog WHERE permission = 'customers.notes.manage';
  EXECUTE $mig$${migration00245Body()}$mig$;
  res := jsonb_set(res, '{fp_after_b}', jsonb_build_object(
    'customers', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.customers x),
    'service_cases', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.service_cases x),
    'case_notes', (SELECT md5(coalesce(string_agg((to_jsonb(x) - 'source')::text, '|' ORDER BY x.id), '')) FROM public.case_notes x),
    'customer_notes', (SELECT count(*) FROM public.customer_notes)));
  res := jsonb_set(res, '{b_struct}', jsonb_build_object(
    'pol', (SELECT jsonb_agg(policyname ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_notes'),
    'open', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_notes' AND (qual = 'true' OR coalesce(qual, '') || coalesce(with_check, '') LIKE '%user_role()%')),
    'case_notes_source', (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'case_notes' AND column_name = 'source'),
    'case_notes_rows', (SELECT count(*) FROM public.case_notes WHERE source = 'manual'),
    'case_notes_all', (SELECT count(*) FROM public.case_notes),
    'anon_grants', (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'customer_notes' AND grantee IN ('anon', 'PUBLIC'))));
  ${seed}
  ${variants('b')}
  -- C) idempotens: kroppen én gang til på den nu eksisterende tabel
  res := jsonb_set(res, '{fp_before_c}', jsonb_build_object(
    'customers', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.customers x),
    'service_cases', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.service_cases x),
    'case_notes', (SELECT md5(coalesce(string_agg((to_jsonb(x) - 'source')::text, '|' ORDER BY x.id), '')) FROM public.case_notes x),
    'customer_notes', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.customer_notes x)));
  EXECUTE $mig$${migration00245Body()}$mig$;
  res := jsonb_set(res, '{fp_after_c}', jsonb_build_object(
    'customers', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.customers x),
    'service_cases', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.service_cases x),
    'case_notes', (SELECT md5(coalesce(string_agg((to_jsonb(x) - 'source')::text, '|' ORDER BY x.id), '')) FROM public.case_notes x),
    'customer_notes', (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.customer_notes x)));
  res := jsonb_set(res, '{c_rows}', to_jsonb((SELECT count(*) FROM public.customer_notes WHERE id IN ('${nA}', '${nH}'))));
  RAISE EXCEPTION 'P245RESULT%P245END', res::text;
END
$probe$;`
    const r = await c.rawSql(sql)
    const m = r.text.match(/P245RESULT([\s\S]*?)P245END/)
    if (r.ok || !m) {
      add('prøven kørte og blev rullet tilbage', false, r.ok ? 'blev IKKE afbrudt (!)' : r.text.slice(0, 900))
      return out
    }
    add('A (staging som den er) + B (prod-stien: ingen tabel) + C (idempotens) kørte i rollback-only-prøven', true)
    const res = JSON.parse(m[1].replace(/\\"/g, '"')) as Record<string, unknown>
    const vis = (cell: Cell) => cell.vis.map((x) => label.get(x) ?? x).sort().join(',')
    const D = '42501'
    // forventet: [synlige, ins_scope, ins_foreign, del_own, del_other, del_foreign, upd_other]
    const want: Record<string, [string, string, string, number | string, number, number, number]> = {
      admin: ['fremmed,i_scope', 'ok', 'ok', 1, 1, 1, 1],
      serviceleder: ['fremmed,i_scope', 'ok', 'ok', 1, 1, 1, 1],
      salg: ['fremmed,i_scope', 'ok', 'ok', 1, 0, 0, 0],
      bogholderi: ['fremmed,i_scope', D, D, 0, 0, 0, 0],
      montor: ['i_scope', D, D, 0, 0, 0, 0],
      montor_grant_edit: ['i_scope', 'ok', D, 1, 0, 0, 0],
      montor_grant_view_all: ['fremmed,i_scope', D, D, 0, 0, 0, 0],
      montor_grant_edit_manage: ['i_scope', 'ok', D, 1, 1, 0, 1],
      salg_revoke_edit: ['fremmed,i_scope', D, D, 0, 0, 0, 0],
      salg_grant_manage: ['fremmed,i_scope', 'ok', 'ok', 1, 1, 1, 1],
      serviceleder_revoke_manage: ['fremmed,i_scope', 'ok', 'ok', 1, 0, 0, 0],
      inaktiv: ['', D, D, 0, 0, 0, 0],
      uden_profil: ['', D, D, 0, 0, 0, 0],
      anon: ['', D, D, D, D, D, D],
    }
    for (const path of ['a', 'b'] as const) {
      const cells = res[path] as Record<string, Cell> | undefined
      if (!cells) { add(`${path.toUpperCase()}: resultat`, false, 'mangler'); continue }
      for (const [k, w] of Object.entries(want)) {
        const cell = cells[k]
        if (!cell) { add(`${path.toUpperCase()} ${k}`, false, 'mangler'); continue }
        const got: [string, string, string, number | string, number | string, number | string, number | string] =
          [vis(cell), cell.ins_scope, cell.ins_foreign, cell.del_own, cell.del_other, cell.del_foreign, cell.upd_other]
        const ok = JSON.stringify(got) === JSON.stringify(w)
        add(`${path.toUpperCase()} ${k}: ser=[${got[0]}] opret(egen/fremmed)=${got[1]}/${got[2]} slet(egen/andens/fremmed)=${got[3]}/${got[4]}/${got[5]} ret(andens)=${got[6]}`,
          ok, ok ? '' : `forventet ${JSON.stringify(w)}`)
      }
      const users = Object.entries(cells).filter(([k]) => k !== 'anon')
      const spoof = users.filter(([, cell]) => !['self', D].includes(cell.ins_spoof)).map(([k]) => k)
      add(`${path.toUpperCase()}: ingen kan oprette en note i en andens navn (created_by)`, spoof.length === 0, spoof.join(','))
      const sys = users.filter(([, cell]) => cell.ins_system !== D).map(([k]) => k)
      add(`${path.toUpperCase()}: source=system/assistant/telegram kun via service-role`, sys.length === 0, sys.join(','))
      const move = Object.entries(cells).filter(([, cell]) => cell.upd_move !== D).map(([k]) => `${k}=${cells[k].upd_move}`)
      add(`${path.toUpperCase()}: en note kan ikke flyttes til en anden kunde (kun content kan rettes)`, move.length === 0, move.join(','))
    }
    const b = res.b_struct as { pol: string[]; open: number; case_notes_source: string | null; case_notes_rows: number; case_notes_all: number; anon_grants: number }
    add('B: præcis de fire _scope-politikker, ingen USING (true)/user_role()', JSON.stringify(b.pol) === JSON.stringify(['customer_notes_delete_scope', 'customer_notes_insert_scope', 'customer_notes_select_scope', 'customer_notes_update_scope']) && b.open === 0, JSON.stringify(b.pol))
    add('B: case_notes.source genskabt med standard manual; eksisterende rækker = manual', /manual/.test(String(b.case_notes_source)) && b.case_notes_rows === b.case_notes_all, `${b.case_notes_rows}/${b.case_notes_all}`)
    add('B: anon/PUBLIC uden grants', b.anon_grants === 0, String(b.anon_grants))
    add('C: kroppen kan køres igen uden at røre eksisterende noter', res.c_rows === 2, String(res.c_rows))
    const sv = res.service_role as Record<string, unknown>
    add('service_role: læser alle, opretter med source=assistant, retter, sletter (kontrollerede server-stier)', sv?.read === 2 && sv?.insert === 'ok' && sv?.update === 1 && sv?.delete === 1, JSON.stringify(sv))
    type Fp = Record<string, string | number>
    const f0 = res.fp_before as Fp, fb = res.fp_after_b as Fp, f1 = res.fp_before_c as Fp, f2 = res.fp_after_c as Fp
    add('B (prod-stien): customers/service_cases/case_notes (uden source) uændret af 00245', f0.customers === fb.customers && f0.service_cases === fb.service_cases && f0.case_notes === fb.case_notes && fb.customer_notes === 0,
      `customers=${String(fb.customers).slice(0, 8)} service_cases=${String(fb.service_cases).slice(0, 8)} case_notes=${String(fb.case_notes).slice(0, 8)} ny tabel tom`)
    add('C (eksisterende tabel = staging-stien): customers/service_cases/case_notes/customer_notes uændret af 00245', JSON.stringify(f1) === JSON.stringify(f2), JSON.stringify(f2).slice(0, 200))
  } catch (e) {
    add('kørsel uden undtagelse', false, e instanceof Error ? e.message : String(e))
  } finally {
    const left = await cleanup()
    out.push({ id: 'oprydning: ingen testkunder tilbage', ok: left === 0, note: `tilbage=${left}` })
    const after = await state()
    out.push({ id: 'intet ændret: politikker/grants/nøgle/noter/case_notes identiske før/efter prøven', ok: before === after, note: before === after ? '' : `${before.slice(0, 300)} ≠ ${after.slice(0, 300)}` })
  }
  return out
}
