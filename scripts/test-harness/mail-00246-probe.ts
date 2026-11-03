/**
 * 00246 incoming_emails SELECT efter effektive rettigheder — staging-prøver.
 *   mail-00246-state  (read-only)     fingeraftryk: incoming_emails-politikker/grants + md5 af mails, kunder, sager,
 *                                     leverandørfakturaer og udgående mail-tabeller (før/efter apply)
 *   mail-00246-probe  (ROLLBACK-ONLY) I ÉN DO-blok der ALTID slutter med RAISE EXCEPTION:
 *     A) staging som den er → persona-matrix ("før" når 00246 ikke er anvendt, ellers "efter")
 *     B) prod-stien: SELECT-politikken sættes til 00180 i transaktionen → matrix (prod "før") → 00246-kroppen → matrix
 *     C) idempotens: 00246-kroppen én gang til → matrix
 * Syv fixture-mails (som postgres, rulles tilbage): kunde i montørens scope (own), fremmed kunde (hidden), ukoblet
 * (unlinked), ukoblet faktura-kilde (invoice), ukoblet på montørens sag (case_own), på en fremmed sag (case_hidden),
 * på salgs D4-sag (case_salg). Personaer: rigtige uid'er (SET LOCAL ROLE authenticated + request.jwt.claims) + overrides.
 * Krav: Henrik 2026-11-03 (effektive rettigheder, ingen USING (true), grant/revoke virker, inaktiv/manglende profil =
 * intet, ingen mail-/kunde-/sagsdata ændret, ingen udgående mail).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { setup240, type M240Check } from './mp-00240-scope-check'

type RawSql = (sql: string) => Promise<{ ok: boolean; status: number; text: string }>

const md5Of = (t: string) => `(SELECT json_build_object('n', count(*), 'md5', md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), ''))) FROM public.${t} x)`
const FP = `json_build_object(
  'incoming_emails', ${md5Of('incoming_emails')}, 'customers', ${md5Of('customers')}, 'service_cases', ${md5Of('service_cases')},
  'incoming_invoices', ${md5Of('incoming_invoices')}, 'email_messages', ${md5Of('email_messages')}, 'emails', ${md5Of('emails')},
  'email_events', ${md5Of('email_events')}, 'sent_quotes', ${md5Of('sent_quotes')})`
const POL = `(SELECT json_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'incoming_emails')`

export const MAIL_00246_STATE_SQL = `SELECT json_build_object(
  'pol', ${POL},
  'grants', (SELECT json_agg(grantee || ':' || privilege_type ORDER BY grantee, privilege_type) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'incoming_emails' AND grantee IN ('anon', 'authenticated', 'PUBLIC')),
  'catalog', (SELECT json_build_object('keys', count(*), 'pairs', (SELECT count(*) FROM public.role_permission_defaults)) FROM public.permission_catalog),
  'fp', ${FP}) f`

/** 00246-kroppen (mellem BEGIN; og COMMIT;) — samme tekst som anvendes */
export function migration00246Body(): string {
  const sql = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '00246_incoming_emails_effective_permissions.sql'), 'utf8').replace(/\r\n/g, '\n')
  const a = sql.indexOf('\nBEGIN;\n'), b = sql.indexOf('\nCOMMIT;\n')
  if (a < 0 || b < a) throw new Error('00246: har ikke BEGIN; … COMMIT;')
  const body = sql.slice(a + '\nBEGIN;\n'.length, b)
  if (body.includes('$mig$')) throw new Error('00246: indeholder $mig$')
  return body
}

const POLICY_00180 = `DROP POLICY IF EXISTS incoming_emails_select ON public.incoming_emails;
  CREATE POLICY incoming_emails_select ON public.incoming_emails FOR SELECT TO authenticated USING (
    public.user_role() IN ('admin', 'serviceleder', 'salg', 'bogholderi')
    OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id)));`

const L = ['own', 'hidden', 'unlinked', 'invoice', 'case_own', 'case_hidden', 'case_salg'] as const
const ALL = [...L].sort().join(',')
const NO_UNLINKED = 'case_hidden,case_own,case_salg,hidden,invoice,own'
const CASES_INV = 'case_hidden,case_own,case_salg,invoice'

/** Forventet efter 00246 (sorteret, kommasepareret) */
export const WANT_AFTER: Record<string, string> = {
  admin: ALL, serviceleder: ALL, salg: ALL, bogholderi: NO_UNLINKED, montor: 'case_own',
  montor_grant_emails: 'case_own,own',
  montor_grant_viewall: 'case_own',
  montor_grant_emails_viewall_edit: ALL,
  montor_grant_inbox: ALL,
  salg_revoke_edit: 'case_salg,hidden,own',
  salg_revoke_emails: 'case_salg',
  bogholderi_grant_inbox: ALL,
  bogholderi_revoke_emails: CASES_INV,
  bogholderi_revoke_invoices: 'case_hidden,case_own,case_salg,hidden,own',
  serviceleder_revoke_inbox: ALL,
  serviceleder_revoke_inbox_emails: CASES_INV,
  inaktiv: '', uden_profil: '', anon: '',
}
/** Før: staging (00186) og prod (00180) for standardrollerne */
const WANT_00186: Record<string, string> = { admin: ALL, serviceleder: ALL, salg: ALL, bogholderi: 'hidden,invoice,own', montor: 'case_own' }
const WANT_00180: Record<string, string> = { admin: ALL, serviceleder: ALL, salg: ALL, bogholderi: ALL, montor: 'case_own' }

export async function runMail00246Probe(c: { admin: SupabaseClient; url: string; anonKey: string; rawSql: RawSql }): Promise<M240Check[]> {
  const out: M240Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const state = async () => (await c.rawSql(MAIL_00246_STATE_SQL)).text
  const before = await state()
  const applied = (JSON.parse(before)[0].f.pol as string[]).some((s) => s.startsWith('incoming_emails_select:') && s.includes('incoming_invoices.view'))
  add(`staging-tilstand læst (00246 ${applied ? 'anvendt' : 'IKKE anvendt'})`, true)
  const { fx, cleanup } = await setup240(c)
  try {
    const { loginPersonas } = await import('./role-matrix')
    const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
    const uid: Record<string, string> = {}
    for (const r of ['admin', 'serviceleder', 'bogholderi']) uid[r] = (await p.get(r as never)!.auth.getUser()).data.user!.id
    const id = Object.fromEntries(L.map((l) => [l, randomUUID()])) as Record<(typeof L)[number], string>
    const label = new Map(Object.entries(id).map(([k, v]) => [v, k]))
    const stamp = randomUUID().slice(0, 8)
    const mail = (l: (typeof L)[number], cust: string | null, kase: string | null) =>
      `('${id[l]}', 'probe-246-${stamp}-${l}', '[PROBE] 246 ${l}', 'probe-246@harness.test', ${cust ? `'${cust}'` : 'NULL'}, ${kase ? `'${kase}'` : 'NULL'}, now())`
    const seed = `INSERT INTO public.incoming_emails (id, graph_message_id, subject, sender_email, customer_id, service_case_id, received_at) VALUES
      ${mail('own', fx.cust.own, null)}, ${mail('hidden', fx.cust.hidden, null)}, ${mail('unlinked', null, null)},
      ${mail('invoice', null, null)}, ${mail('case_own', null, fx.cases.own)}, ${mail('case_hidden', null, fx.cases.hidden)},
      ${mail('case_salg', null, fx.cases.salgD4)};
    INSERT INTO public.incoming_invoices (source, source_email_id) VALUES ('email', '${id.invoice}');`
    const ov = (profile: string, rows: Array<[string, 'grant' | 'revoke']>) =>
      `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${rows.map(([k, e]) => `('${profile}', '${k}', '${e}', 'manual', 'probe 246')`).join(',')};`
    const clearOv = (profile: string) => `DELETE FROM public.user_permission_overrides WHERE profile_id = '${profile}';`
    const std = (k: string) => `res := jsonb_set(res, '{${k}}', jsonb_build_object('admin', pg_temp.p246('${uid.admin}'), 'serviceleder', pg_temp.p246('${uid.serviceleder}'),
        'bogholderi', pg_temp.p246('${uid.bogholderi}'), 'salg', pg_temp.p246('${fx.s.uid}'), 'montor', pg_temp.p246('${fx.m.uid}')));`
    const v = (k: string, name: string, who: string, rows: Array<[string, 'grant' | 'revoke']>) =>
      `${ov(who, rows)}\n  res := jsonb_set(res, '{${k},${name}}', pg_temp.p246('${who}'));\n  ${clearOv(who)}`
    const variants = (k: string) => `
  ${std(k)}
  ${v(k, 'montor_grant_emails', fx.m.uid, [['customers.emails.view', 'grant']])}
  ${v(k, 'montor_grant_viewall', fx.m.uid, [['customers.view.all', 'grant']])}
  ${v(k, 'montor_grant_emails_viewall_edit', fx.m.uid, [['customers.emails.view', 'grant'], ['customers.view.all', 'grant'], ['customers.edit', 'grant']])}
  ${v(k, 'montor_grant_inbox', fx.m.uid, [['inbox.view', 'grant']])}
  ${v(k, 'salg_revoke_edit', fx.s.uid, [['customers.edit', 'revoke']])}
  ${v(k, 'salg_revoke_emails', fx.s.uid, [['customers.emails.view', 'revoke']])}
  ${v(k, 'bogholderi_grant_inbox', uid.bogholderi, [['inbox.view', 'grant']])}
  ${v(k, 'bogholderi_revoke_emails', uid.bogholderi, [['customers.emails.view', 'revoke']])}
  ${v(k, 'bogholderi_revoke_invoices', uid.bogholderi, [['incoming_invoices.view', 'revoke']])}
  ${v(k, 'serviceleder_revoke_inbox', uid.serviceleder, [['inbox.view', 'revoke']])}
  ${v(k, 'serviceleder_revoke_inbox_emails', uid.serviceleder, [['inbox.view', 'revoke'], ['customers.emails.view', 'revoke']])}
  ${ov(fx.m.uid, [['inbox.view', 'grant']])}
  UPDATE public.profiles SET is_active = false WHERE id = '${fx.m.uid}';
  res := jsonb_set(res, '{${k},inaktiv}', pg_temp.p246('${fx.m.uid}'));
  UPDATE public.profiles SET is_active = true WHERE id = '${fx.m.uid}';
  ${clearOv(fx.m.uid)}
  res := jsonb_set(res, '{${k},uden_profil}', pg_temp.p246('${randomUUID()}'));
  res := jsonb_set(res, '{${k},anon}', pg_temp.p246(NULL, true));`
    const ids = L.map((l) => `''${id[l]}''`).join(', ')
    const sql = `DO $probe$
DECLARE res jsonb := '{}'::jsonb;
BEGIN
  CREATE FUNCTION pg_temp.p246(p_uid uuid, p_anon boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $f$
  DECLARE v jsonb; n int;
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
        EXECUTE 'SELECT coalesce(jsonb_agg(x.id ORDER BY x.id), ''[]'') FROM public.incoming_emails x WHERE x.id IN (${ids})' INTO v;
      EXCEPTION WHEN insufficient_privilege THEN v := '"42501"'::jsonb;
      END;
      -- en opdatering af en fixture-mail (rulles tilbage) må kun ramme rækker personaen kan se
      BEGIN
        EXECUTE 'UPDATE public.incoming_emails SET is_read = true WHERE id IN (${ids})';
        GET DIAGNOSTICS n = ROW_COUNT;
      EXCEPTION WHEN insufficient_privilege THEN n := -1;
      END;
      RAISE EXCEPTION 'P246UNDO';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'P246UNDO' THEN RAISE; END IF;
    END;
    RETURN jsonb_build_object('vis', v, 'upd', n);
  END $f$;
  res := jsonb_set(res, '{fp0}', to_jsonb(${FP}));
  ${seed}
  -- A) staging som den er
  ${variants('a')}
  -- B) prod-stien: 00180-politikken → før-matrix → 00246-kroppen → efter-matrix
  ${POLICY_00180}
  ${std('b_before')}
  res := jsonb_set(res, '{fp_b_pre}', to_jsonb(${FP}));
  EXECUTE $mig$${migration00246Body()}$mig$;
  res := jsonb_set(res, '{fp_b_post}', to_jsonb(${FP}));
  res := jsonb_set(res, '{b_pol}', to_jsonb(${POL}));
  ${variants('b')}
  -- C) idempotens
  EXECUTE $mig$${migration00246Body()}$mig$;
  res := jsonb_set(res, '{c_pol}', to_jsonb(${POL}));
  ${variants('c')}
  res := jsonb_set(res, '{fp_end}', to_jsonb(${FP}));
  RAISE EXCEPTION 'P246RESULT%P246END', res::text;
END
$probe$;`
    const r = await c.rawSql(sql)
    const m = r.text.match(/P246RESULT([\s\S]*?)P246END/)
    if (r.ok || !m) {
      add('prøven kørte og blev rullet tilbage', false, r.ok ? 'blev IKKE afbrudt (!)' : r.text.slice(0, 900))
      return out
    }
    add('A (staging som den er) + B (prod-stien fra 00180) + C (idempotens) kørte i rollback-only-prøven', true)
    const res = JSON.parse(m[1].replace(/\\"/g, '"')) as Record<string, any>
    const vis = (cell: { vis: unknown }) => Array.isArray(cell.vis) ? (cell.vis as string[]).map((x) => label.get(x) ?? x).sort().join(',') : String(cell.vis)
    const check = (path: string, want: Record<string, string>) => {
      for (const [k, w] of Object.entries(want)) {
        const cell = res[path]?.[k]
        if (!cell) { add(`${path}/${k}`, false, 'mangler'); continue }
        const got = vis(cell)
        const nVis = got ? got.split(',').length : 0
        const updOk = k === 'anon' ? cell.upd === -1 || cell.upd === 0 : cell.upd === nVis
        add(`${path}/${k}: ser [${got || '—'}], opdaterer ${cell.upd}`, got === w && updOk, got === w ? (updOk ? '' : `UPDATE ramte ${cell.upd} ≠ synlige ${nVis}`) : `forventet [${w || '—'}]`)
      }
    }
    check('a', applied ? WANT_AFTER : WANT_00186)
    check('b_before', WANT_00180)
    check('b', WANT_AFTER)
    check('c', WANT_AFTER)
    const pol = (x: unknown) => JSON.stringify(x)
    const sel = (x: string[]) => x.filter((s) => s.startsWith('incoming_emails_select:'))
    add('B: præcis én SELECT-politik, uden user_role() og uden USING (true)', sel(res.b_pol).length === 1 && !/user_role\(\)/.test(sel(res.b_pol)[0]) && !/:SELECT:true:/.test(sel(res.b_pol)[0]), sel(res.b_pol)[0]?.slice(0, 120))
    add('B: skrive-politikker uændret (INSERT/UPDATE/DELETE)', pol((res.b_pol as string[]).filter((s) => !s.startsWith('incoming_emails_select:'))) === pol((JSON.parse(before)[0].f.pol as string[]).filter((s) => !s.startsWith('incoming_emails_select:'))))
    add('C: idempotent (samme politikker efter anden kørsel)', pol(res.c_pol) === pol(res.b_pol))
    const fp = (x: any) => JSON.stringify({ ...x })
    add('data uændret af 00246-kroppen (mails, kunder, sager, fakturaer, udgående mail-tabeller)', fp(res.fp_b_pre) === fp(res.fp_b_post), fp(res.fp_b_post).slice(0, 200))
    add('fixtures + overrides rullet tilbage inden for prøven ⇒ udgående tabeller uændret', ['email_messages', 'emails', 'email_events', 'sent_quotes'].every((t) => fp(res.fp0[t]) === fp(res.fp_end[t])))
    return out
  } finally {
    const left = await cleanup()
    add('oprydning: 0 testkunder tilbage', left === 0, `tilbage=${left}`)
    const after = await state()
    add('staging-tilstand identisk før/efter prøven inkl. oprydning (politikker, grants, katalog, data-md5)', after === before, after === before ? '' : after.slice(0, 300))
  }
}
