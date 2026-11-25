/**
 * 00254 parts-/publikumsfundament — PRODUCTION PRÆFLIGHT, ROLLBACK-ONLY (ÉN transaktion, REPEATABLE READ, ALTID ROLLBACK).
 *   npx tsx scripts/prod-00254-dryrun.ts
 *
 * før-struktur/-data → PRÆCIS migrationskrop (tekst mellem BEGIN; og COMMIT; i den godkendte fil, md5 vises) → objekter,
 * grants, standarder → SAVEPOINT tests: rigtige prod-profiler (SET LOCAL ROLE + jwt-claims) mod syntetiske [PROBE]-rækker:
 * parter/relationer/deltagere, angreb på external_publications, 6 publikummer på Sag 1 + Kunde B, external_feed-matrix,
 * dokumentværn, klassepræcedens, Stage A (reception_ingest, tråd, kandidat, henvendelser-handlinger, lease) og
 * rettighedsoverrides → ROLLBACK TO tests → godkendt rollback-SQL (docs/runbooks/sql/00254_rollback.sql) → struktur og
 * data = før. Til sidst ROLLBACK af det hele (prod-rollback-probe.ts udsteder aldrig COMMIT).
 *
 * Låse: ALTER TABLE conversations (ACCESS EXCLUSIVE) og FK'er (SHARE ROW EXCLUSIVE på customers/service_cases/…) holdes
 * under transaktionen. lock_timeout 3 s (vi stiller os aldrig i kø foran produktionen); prøven starter ikke hvis
 * mail-sync-lease'en er holdt. Kun PASS/FAIL + antal/fejlkoder ud — ingen id'er, navne eller indhold.
 */
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'
import { STRUCT_MD5 } from './test-harness/reception-00249-probe'

const MIG = 'supabase/migrations/00254_party_audience_foundation.sql'
const RB = 'docs/runbooks/sql/00254_rollback.sql'
const migFile = readFileSync(MIG, 'utf8').replace(/\r\n/g, '\n')
const a = migFile.indexOf('\nBEGIN;\n'), b = migFile.indexOf('\nCOMMIT;\n')
if (a < 0 || b < a) throw new Error('00254: BEGIN; … COMMIT; ikke fundet')
const BODY = migFile.slice(a + '\nBEGIN;\n'.length, b)
// Den kommenterede rollback-blok i migrationen (uden "-- ") skal være identisk med rollback-filen
const commented = migFile.slice(migFile.indexOf('\n-- ROLLBACK')).split('\n').filter((l) => /^-- (BEGIN;|COMMIT;|DROP |ALTER |  DROP |DELETE |NOTIFY )/.test(l)).map((l) => l.slice(3))
const rbFile = readFileSync(RB, 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => l && !l.startsWith('--'))
const RB_BODY = rbFile.filter((l) => l !== 'BEGIN;' && l !== 'COMMIT;').join('\n')
const md5 = (s: string) => createHash('md5').update(s).digest('hex')

const FP_TABLES = ['conversations', 'conversation_items', 'conversation_actions', 'incoming_emails', 'graph_sync_state', 'sync_leases', 'customers',
  'customer_contacts', 'suppliers', 'leads', 'profiles', 'service_cases', 'customer_documents', 'portal_access_tokens', 'partner_access_tokens',
  'portal_messages', 'customer_tasks', 'case_notes', 'permission_catalog', 'role_permission_defaults', 'user_permission_overrides', 'audit_logs']
const NEW_COLS = `- 'source_party_id' - 'communication_class' - 'communication_class_source'`
const FP = `SELECT ${FP_TABLES.map((t) => `(SELECT count(*)::int || ':' || md5(coalesce(string_agg((to_jsonb(x) ${t === 'conversations' ? NEW_COLS : ''})::text, '|' ORDER BY (to_jsonb(x) ${t === 'conversations' ? NEW_COLS : ''})::text), '')) FROM public.${t} x) AS "${t}"`).join(', ')}`
const OBJ = `SELECT json_build_object(
  'tables', (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname IN ('parties','party_relationships','case_participants','external_publications')),
  'conv_cols', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name IN ('source_party_id','communication_class','communication_class_source')),
  'fns', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('publish_external','revoke_external_publication','external_feed','party_can_be_audience','party_visible_to_me','case_visible_to_me','conversations_party_guard','party_relationships_guard','external_publications_guard')),
  'triggers', (SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_conversations_party_guard','trg_party_relationships_guard','trg_external_publications_guard')),
  'policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants','external_publications')),
  'keys', (SELECT count(*) FROM public.permission_catalog WHERE permission IN ('parties.manage','portal.publish')),
  'pairs', (SELECT coalesce(json_agg(role::text || ':' || permission ORDER BY role::text, permission), '[]') FROM public.role_permission_defaults WHERE permission IN ('parties.manage','portal.publish')),
  'catalog', (SELECT count(*) FROM public.permission_catalog), 'defaults', (SELECT count(*) FROM public.role_permission_defaults),
  'rls', (SELECT coalesce(bool_and(relrowsecurity), false) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('parties','party_relationships','case_participants','external_publications'))) j`

// svcSub = en service_role-session (DB-rolle service_role) med et påklistret sub — PostgREST sætter DB-rollen ud fra JWT'ens role,
// så en forfalsket bruger kræver en signeret bruger-JWT (= at være brugeren); dette er det stærkeste realistiske falsum
type Who = 'owner' | 'anon' | 'service' | { uid: string } | { svcSub: string }
type Res = { ok: true; rows: any[] } | { ok: false; code: string }

runMain(() => withProdRollbackProbe('00254-dryrun', async ({ q: q0, add, notTestable }) => {
  let lastSql = ''
  const q = (sql: string, params: unknown[] = []) => { lastSql = sql.replace(/\s+/g, ' ').slice(0, 90); return q0(sql, params) }
  try {
  const t0 = Date.now()
  await q(`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`)
  await q(`SET LOCAL lock_timeout = '3s'`)
  if (/\bcommit\b/i.test(BODY) || /\bcommit\b/i.test(RB_BODY)) throw new Error('transaktionskontrol i kroppen')
  console.log(`  migrationsfil md5=${md5(readFileSync(MIG, 'utf8'))} · krop md5=${md5(BODY)} (${BODY.split('\n').length} linjer, uændret tekst mellem BEGIN; og COMMIT;)`)
  add('NY', 'rollback-filen = den kommenterede ROLLBACK-blok i migrationen (linje for linje)', JSON.stringify(commented) === JSON.stringify(rbFile), `${commented.length} vs ${rbFile.length} linjer`)
  const lease = (await q(`SELECT count(*)::int n FROM public.sync_leases WHERE expires_at > now()`))[0].n as number
  if (lease > 0) throw new Error('mail-sync-lease er holdt lige nu — prøv igen om et par minutter (prøven må ikke blokere Stage A)')

  // ---------- step-hjælper: savepoint, rolle + claims, kør; behold ændringer (keep) eller rul tilbage
  let sp = 0
  const st = async (who: Who, sql: string, params: unknown[] = [], keep = false, pre: Array<[string, unknown[]]> = []): Promise<Res> => {
    const name = `s${++sp}`
    await q(`SAVEPOINT ${name}`)
    try {
      const isSvc = who === 'service' || (typeof who === 'object' && 'svcSub' in who)
      const sub = typeof who === 'object' ? ('uid' in who ? who.uid : who.svcSub) : ''
      const role = who === 'owner' ? '' : who === 'anon' ? 'anon' : isSvc ? 'service_role' : 'authenticated'
      const claims = who === 'owner' ? '' : JSON.stringify(sub ? { sub, role } : { role })
      await q(`SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)`, [claims, sub, role])
      if (who === 'anon') await q('SET LOCAL ROLE anon')
      else if (isSvc) await q('SET LOCAL ROLE service_role')
      else if (who !== 'owner') await q('SET LOCAL ROLE authenticated')
      for (const [ps, pp] of pre) await q(ps, pp)
      const rows = await q(sql, params)
      await q('RESET ROLE')
      if (keep) await q(`RELEASE SAVEPOINT ${name}`); else await q(`ROLLBACK TO SAVEPOINT ${name}`)
      return { ok: true, rows }
    } catch (e) {
      await q(`ROLLBACK TO SAVEPOINT ${name}`)
      await q('RESET ROLE')
      return { ok: false, code: (e as { code?: string }).code ?? 'fejl' }
    } finally {
      await q(`SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true)`)
    }
  }
  const keep = (who: Who, sql: string, params: unknown[] = []) => st(who, sql, params, true)
  const code = (r: Res) => (r.ok ? `ok:${r.rows.length}` : r.code)
  const refused = (r: Res) => !r.ok || r.rows.length === 0
  const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0]

  // ---------- FØR
  const struct0 = (await one(`SELECT ${STRUCT_MD5} s`)).s as string
  const fp0 = await one(FP)
  const obj0 = (await one(OBJ)).j
  add('UÆNDRET', 'før: ingen 00254-objekter (tabeller/kolonner/funktioner/triggere/politikker/nøgler)', obj0.tables === 0 && obj0.conv_cols === 0 && obj0.fns === 0 && obj0.triggers === 0 && obj0.policies === 0 && obj0.keys === 0, JSON.stringify(obj0))
  console.log(`  før: struktur ${struct0.slice(0, 8)}… katalog=${obj0.catalog} standarder=${obj0.defaults}`)

  // ---------- MIGRATION (præcis krop)
  try { await q(BODY) } catch (e) { add('NY', 'migrationskroppen kører rent på prod-skemaet', false, (e as { code?: string }).code ?? 'fejl'); return }
  add('NY', 'migrationskroppen kører rent på prod-skemaet (præcis tekst, ingen ændringer)', true, '')
  const obj1 = (await one(OBJ)).j
  const expPairs = ['admin:parties.manage', 'admin:portal.publish', 'salg:portal.publish', 'serviceleder:parties.manage', 'serviceleder:portal.publish']
  add('NY', 'objekter: 4 tabeller (RLS), 3 kolonner, 9 funktioner, 3 triggere, 10 politikker, 2 nøgler', obj1.tables === 4 && obj1.rls === true && obj1.conv_cols === 3 && obj1.fns === 9 && obj1.triggers === 3 && obj1.policies === 10 && obj1.keys === 2, JSON.stringify(obj1))
  add('NY', 'standarder præcis: parties.manage=admin+serviceleder; portal.publish=admin+serviceleder+salg; ingen montør/bogholderi', JSON.stringify(obj1.pairs) === JSON.stringify(expPairs), JSON.stringify(obj1.pairs))
  add('NY', `katalog ${obj0.catalog}→${obj1.catalog} (+2), standarder ${obj0.defaults}→${obj1.defaults} (+5)`, obj1.catalog === obj0.catalog + 2 && obj1.defaults === obj0.defaults + 5, '')
  const grants = (await one(`SELECT json_build_object(
    'anon_tbl', (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee = 'anon' AND table_name IN ('parties','party_relationships','case_participants','external_publications')),
    'auth_pub', (SELECT coalesce(string_agg(privilege_type, ',' ORDER BY privilege_type), '') FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee = 'authenticated' AND table_name = 'external_publications'),
    'svc_pub', (SELECT coalesce(string_agg(privilege_type, ',' ORDER BY privilege_type), '') FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee = 'service_role' AND table_name = 'external_publications'),
    'del', (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND privilege_type = 'DELETE' AND grantee IN ('anon','authenticated','service_role') AND table_name = 'external_publications'),
    'pub_exec', json_build_object('auth', has_function_privilege('authenticated', 'public.publish_external(text,uuid,uuid,text,text,text,uuid,text,uuid)', 'EXECUTE'), 'svc', has_function_privilege('service_role', 'public.publish_external(text,uuid,uuid,text,text,text,uuid,text,uuid)', 'EXECUTE'), 'anon', has_function_privilege('anon', 'public.publish_external(text,uuid,uuid,text,text,text,uuid,text,uuid)', 'EXECUTE')),
    'svc_any', (SELECT coalesce(json_agg(proname ORDER BY proname), '[]') FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('publish_external','revoke_external_publication','party_can_be_audience','party_visible_to_me','case_visible_to_me','conversations_party_guard','party_relationships_guard','external_publications_guard') AND has_function_privilege('service_role', oid, 'EXECUTE')),
    'anon_any', (SELECT coalesce(json_agg(proname ORDER BY proname), '[]') FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('publish_external','revoke_external_publication','external_feed','party_can_be_audience','party_visible_to_me','case_visible_to_me','conversations_party_guard','party_relationships_guard','external_publications_guard') AND has_function_privilege('anon', oid, 'EXECUTE')),
    'feed_exec', json_build_object('auth', has_function_privilege('authenticated', 'public.external_feed(text,uuid)', 'EXECUTE'), 'svc', has_function_privilege('service_role', 'public.external_feed(text,uuid)', 'EXECUTE'), 'anon', has_function_privilege('anon', 'public.external_feed(text,uuid)', 'EXECUTE')),
    'raw_role_checks', (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('publish_external','revoke_external_publication','external_feed','party_can_be_audience','party_visible_to_me','case_visible_to_me','conversations_party_guard','party_relationships_guard','external_publications_guard') AND (prosrc ILIKE '%user_role()%' OR prosrc ~* 'profiles\\s+\\w*\\s*where.*role')),
    'raw_role_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('parties','party_relationships','case_participants','external_publications') AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%user_role()%')) j`)).j
  add('NY', 'grants: anon intet; authenticated kun SELECT på external_publications; service_role kun SELECT; ingen DELETE til nogen app-rolle', grants.anon_tbl === 0 && grants.auth_pub === 'SELECT' && grants.svc_pub === 'SELECT' && grants.del === 0, JSON.stringify(grants))
  add('NY', 'publish_external: kun authenticated · external_feed: kun service_role', grants.pub_exec.auth === true && grants.pub_exec.svc === false && grants.pub_exec.anon === false && grants.feed_exec.svc === true && grants.feed_exec.auth === false && grants.feed_exec.anon === false, JSON.stringify([grants.pub_exec, grants.feed_exec]))
  add('NY', 'funktions-ACL: service_role har KUN EXECUTE på external_feed; anon på ingen af de 9 (Supabase default privileges lukket)', JSON.stringify(grants.svc_any) === '[]' && JSON.stringify(grants.anon_any) === '[]', `svc=${JSON.stringify(grants.svc_any)} anon=${JSON.stringify(grants.anon_any)}`)
  add('NY', 'ingen rå rolle-tjek (user_role()) i 00254-funktioner/-politikker — kun user_has_permission', grants.raw_role_checks === 0 && grants.raw_role_policies === 0, `${grants.raw_role_checks}/${grants.raw_role_policies}`)
  const conv = (await one(`SELECT count(*)::int n, count(*) FILTER (WHERE source_party_id IS NULL AND communication_class = 'unknown' AND communication_class_source = 'none')::int d FROM public.conversations`))
  add('NY', `nye conversations-kolonner: alle ${conv.n} eksisterende henvendelser = NULL/unknown/none (ingen backfill)`, conv.n === conv.d, `${conv.d}/${conv.n}`)
  const fp1 = await one(FP)
  const PERM_T = ['permission_catalog', 'role_permission_defaults']
  add('NY', 'anvendt: alle øvrige 20 data-fingeraftryk uændrede (conversations uden de nye kolonner); kun katalog/standarder ændret (+2/+5, tjekket ovenfor)', FP_TABLES.filter((k) => !PERM_T.includes(k)).every((k) => fp0[k] === fp1[k]) && PERM_T.every((k) => fp0[k] !== fp1[k]), FP_TABLES.filter((k) => fp0[k] !== fp1[k]).join(',') || '')
  const newRows = await one(`SELECT (SELECT count(*) FROM public.parties) + (SELECT count(*) FROM public.party_relationships) + (SELECT count(*) FROM public.case_participants) + (SELECT count(*) FROM public.external_publications) n`)
  add('NY', 'anvendt: 0 rækker i de fire nye tabeller', Number(newRows.n) === 0, String(newRows.n))

  // ================= TESTS (alt herunder rulles tilbage til savepoint 'tests' før rollback-SQL'en)
  await q('SAVEPOINT tests')
  // ---------- PERSONAER. Prod har kun admin- og montørprofiler; serviceleder/salg/bogholderi skabes INDE i transaktionen ved
  // at give eksisterende profiler en anden basisrolle (rulles tilbage med 'tests'; profiles-fingeraftrykket beviser det).
  const profs = (await q(`SELECT id, role::text role, is_active FROM public.profiles ORDER BY created_at`)) as Array<{ id: string; role: string; is_active: boolean }>
  const admins = profs.filter((p) => p.role === 'admin' && p.is_active), monts = profs.filter((p) => p.role === 'montør')
  const montActive = monts.find((p) => p.is_active), montSpare = monts.find((p) => p !== montActive)
  const ovCount = (await one(`SELECT count(*)::int n FROM public.user_permission_overrides`)).n
  const U: Record<'adm' | 'sl' | 'salg' | 'mont' | 'bog', string | undefined> = { adm: admins[0]?.id, sl: admins[1]?.id, salg: admins[2]?.id, mont: montActive?.id, bog: montSpare?.id }
  const missing = Object.entries(U).filter(([, v]) => !v).map(([k]) => k)
  add('UÆNDRET', `personaer: admin(${admins.length}) + montør(${monts.length}); serviceleder/salg/bogholderi skabes i transaktionen; ${ovCount} overrides i prod`, missing.length === 0 && ovCount === 0, missing.join(','))
  if (missing.length) return
  await q(`UPDATE public.profiles SET role = 'serviceleder' WHERE id = $1`, [U.sl])
  await q(`UPDATE public.profiles SET role = 'salg' WHERE id = $1`, [U.salg])
  await q(`UPDATE public.profiles SET role = 'bogholderi', is_active = true WHERE id = $1`, [U.bog])
  const u = (k: keyof typeof U) => ({ uid: U[k]! })
  const eff: Record<string, string> = {}
  for (const k of ['adm', 'sl', 'salg', 'mont', 'bog'] as const) {
    const r = await st(u(k), `SELECT public.user_has_permission('parties.manage') pm, public.user_has_permission('portal.publish') pp`)
    eff[k] = r.ok ? `${r.rows[0].pm ? 'M' : '-'}${r.rows[0].pp ? 'P' : '-'}` : r.code
  }
  add('NY', 'effektive rettigheder: admin M+P · serviceleder M+P · salg kun P · montør ingen · bogholderi ingen', eff.adm === 'MP' && eff.sl === 'MP' && eff.salg === '-P' && eff.mont === '--' && eff.bog === '--', JSON.stringify(eff))

  const stamp = md5(String(Date.now())).slice(0, 8)
  const id = async () => (await one(`SELECT gen_random_uuid() id`)).id as string
  const C = { a: await id(), b: await id(), y: await id() }
  const S_X = await id()
  const K = { c1: await id(), c2: await id(), c3: await id() }
  const D = { shared: await id(), internalFlag: await id(), mail: await id(), caseB: await id(), custB: await id() }
  const EM = { sup: await id() }
  await q(`INSERT INTO public.customers (id, customer_number, company_name, contact_person, email, created_by) VALUES
    ($1, 'P254A-' || $4, '[PROBE] Kunde A', 'A', 'p254-a-' || $4 || '@harness.test', $5::uuid), ($2, 'P254B-' || $4, '[PROBE] Kunde B', 'B', 'p254-b-' || $4 || '@harness.test', $5::uuid),
    ($3, 'P254Y-' || $4, '[PROBE] Partner Y', 'Y', 'p254-y-' || $4 || '@harness.test', $5::uuid)`,
    [C.a, C.b, C.y, stamp, U.sl])
  await q(`INSERT INTO public.suppliers (id, name, is_active) VALUES ($1, '[PROBE] Leverandør X ' || $2, true)`, [S_X, stamp])
  await q(`INSERT INTO public.service_cases (id, title, customer_id, created_by) VALUES ($1, '[PROBE] Sag 1', $4, $6), ($2, '[PROBE] Sag 2', $5, $6), ($3, '[PROBE] Sag 3 (salg)', $4, $7)`,
    [K.c1, K.c2, K.c3, C.a, C.b, U.sl, U.salg])
  await q(`INSERT INTO public.incoming_emails (id, graph_message_id, subject, sender_email, body_text, customer_id, service_case_id, received_at) VALUES
    ($1, 'p254-sup-' || $4, '[PROBE] Ordrebekræftelse', 'ordre@leverandoer-x.test', 'Indkøbspris 31.800 kr., batteriet er restordre', $2, $3, now())`, [EM.sup, C.a, K.c1, stamp])
  await q(`INSERT INTO public.customer_documents (id, customer_id, service_case_id, title, file_url, file_name, visible_in_portal, source_email_id) VALUES
    ($1, $6, $8, '[PROBE] Delt tegning', 'probe://x', 'tegning.pdf', true, NULL),
    ($2, $6, $8, '[PROBE] Intern kalkule', 'probe://y', 'kalk.pdf', false, NULL),
    ($3, $6, $8, '[PROBE] Ordrebekraeftelse.pdf', 'probe://z', 'ob.pdf', true, $10),
    ($4, $7, $9, '[PROBE] Kunde B sagsdokument', 'probe://b', 'b.pdf', true, NULL),
    ($5, $7, NULL, '[PROBE] Kunde B dokument', 'probe://b2', 'b2.pdf', true, NULL)`, [D.shared, D.internalFlag, D.mail, D.caseB, D.custB, C.a, C.b, K.c1, K.c2, EM.sup])
  await q(`INSERT INTO public.case_notes (case_id, content, created_by) VALUES ($1, '[PROBE] Internt: giv ikke rabat', $2)`, [K.c1, U.sl])
  // document_type='internal' — kan den overhovedet eksistere i prod? (F-2)
  const docInternalType = await keep('owner', `INSERT INTO public.customer_documents (id, customer_id, service_case_id, title, file_url, file_name, visible_in_portal, document_type) VALUES (gen_random_uuid(), $1, $2, '[PROBE] intern type', 'probe://i', 'i.pdf', true, 'internal') RETURNING id`, [C.a, K.c1])
  const docInternalTypeId = docInternalType.ok ? docInternalType.rows[0].id as string : null

  // ----- PARTER (serviceleder: parties.manage)
  const party = async (kind: string, name: string, col: string | null, val: string | null) => {
    // uden RETURNING (se F-6: SELECT-politikken slår rækken op igen og ser ikke den nye række i samme udsagn)
    const pid = await id()
    const r = await keep(u('sl'), `INSERT INTO public.parties (id, kind, display_name, ${col ?? 'vat_number'}, created_by) VALUES ($5, $1, $2, $3, $4)`, [kind, name, val, U.sl, pid])
    return r.ok ? pid : `ERR:${r.code}`
  }
  const P = {
    a: await party('person', 'A', 'customer_id', C.a), b: await party('person', 'B', 'customer_id', C.b), y: await party('organisation', 'Y', 'customer_id', C.y),
    x: await party('organisation', 'X', 'supplier_id', S_X), m: await party('organisation', 'M', null, null), s: await party('organisation', 'S', null, null),
    u: await party('organisation', 'U (urelateret)', null, null),
  }
  const retTry = await st(u('sl'), `INSERT INTO public.parties (kind, display_name, created_by) VALUES ('person', 'ret', $1) RETURNING id`, [U.sl])
  const plainTry = await st(u('sl'), `INSERT INTO public.parties (kind, display_name, created_by) VALUES ('person', 'ret', $1)`, [U.sl])
  add('NY', 'F-6 (måling): INSERT … RETURNING på parties afvises (42501) for brugere — plain INSERT virker; fase B skal bruge return=minimal eller inline SELECT-politik', !retTry.ok && retTry.code === '42501' && plainTry.ok, `${code(retTry)}/${code(plainTry)}`)
  add('NY', 'serviceleder opretter 7 parter (A, B, Y, X, M, S, urelateret U)', Object.values(P).every((v) => !v.startsWith('ERR')), JSON.stringify(Object.values(P).filter((v) => v.startsWith('ERR'))))
  const anonSel = await st('anon', `SELECT 1 FROM public.parties`)
  const anonIns = await st('anon', `INSERT INTO public.parties (kind, display_name) VALUES ('person', 'x') RETURNING 1`)
  add('NY', 'anon: kan ikke læse eller skrive parter', !anonSel.ok && !anonIns.ok, `${code(anonSel)}/${code(anonIns)}`)
  const salgIns = await st(u('salg'), `INSERT INTO public.parties (kind, display_name, created_by) VALUES ('person', 'x', $1) RETURNING 1`, [U.salg])
  const montIns = await st(u('mont'), `INSERT INTO public.parties (kind, display_name, created_by) VALUES ('person', 'x', $1) RETURNING 1`, [U.mont])
  const slForged = await st(u('sl'), `INSERT INTO public.parties (kind, display_name, created_by) VALUES ('person', 'x', $1) RETURNING 1`, [U.adm])
  add('NY', 'opret part: salg/montør (uden parties.manage) afvist; serviceleder i en andens navn afvist', !salgIns.ok && !montIns.ok && !slForged.ok, `${code(salgIns)}/${code(montIns)}/${code(slForged)}`)
  const allP = Object.values(P)
  const nonCust = [P.x, P.m, P.s, P.u]
  const seeP = async (k: keyof typeof U) => { const r = await st(u(k), `SELECT count(*)::int n, count(*) FILTER (WHERE id = ANY ($2::uuid[]))::int nc FROM public.parties WHERE id = ANY ($1::uuid[])`, [allP, nonCust]); return r.ok ? `${r.rows[0].n}/${r.rows[0].nc}` : r.code }
  const vis = { adm: await seeP('adm'), sl: await seeP('sl'), salg: await seeP('salg'), mont: await seeP('mont'), bog: await seeP('bog') }

  // ----- RELATIONER
  const rel = async (who: Who, party_: string, relationship: string, status: string, source: string, confirmer: string | null | undefined, creator: string | null | undefined) =>
    keep(who, `INSERT INTO public.party_relationships (party_id, relationship, status, source, confirmed_by, confirmed_at, created_by) VALUES ($1, $2, $3, $4, $5::uuid, CASE WHEN $5::uuid IS NULL THEN NULL ELSE now() END, $6) RETURNING id`,
      [party_, relationship, status, source, confirmer, creator])
  const r1 = [await rel(u('sl'), P.a, 'customer', 'active', 'register', null, U.sl), await rel(u('sl'), P.x, 'supplier', 'active', 'register', null, U.sl),
    await rel(u('sl'), P.y, 'cooperation_partner', 'active', 'manual', U.sl, U.sl), await rel(u('sl'), P.m, 'manufacturer', 'active', 'manual', U.sl, U.sl),
    await rel(u('sl'), P.s, 'subcontractor', 'active', 'manual', U.sl, U.sl)]
  add('NY', 'serviceleder: 5 aktive relationer (A kunde/X leverandør via register; Y partner/M producent/S underleverandør manuelt bekræftet)', r1.every((r) => r.ok), r1.map(code).join(','))
  const regNoLink = await st(u('sl'), `INSERT INTO public.party_relationships (party_id, relationship, status, source, created_by) VALUES ($1, 'supplier', 'active', 'register', $2) RETURNING 1`, [P.m, U.sl])
  const regNoLink2 = await st(u('sl'), `INSERT INTO public.party_relationships (party_id, relationship, status, source, created_by) VALUES ($1, 'customer', 'active', 'register', $2) RETURNING 1`, [P.x, U.sl])
  add('NY', 'register-relation kræver ægte kanonisk registerkobling (M som leverandør / X som kunde afvist)', !regNoLink.ok && !regNoLink2.ok, `${code(regNoLink)}/${code(regNoLink2)}`)
  const otherConfirmer = await st(u('sl'), `INSERT INTO public.party_relationships (party_id, relationship, status, source, confirmed_by, confirmed_at, created_by) VALUES ($1, 'subcontractor', 'active', 'manual', $2, now(), $3) RETURNING 1`, [P.b, U.salg, U.sl])
  const noConfirmer = await st(u('sl'), `INSERT INTO public.party_relationships (party_id, relationship, status, source, created_by) VALUES ($1, 'subcontractor', 'active', 'manual', $2) RETURNING 1`, [P.b, U.sl])
  add('NY', 'aktiv manuel relation: anden bekræfter eller ingen bekræfter afvist', !otherConfirmer.ok && !noConfirmer.ok, `${code(otherConfirmer)}/${code(noConfirmer)}`)
  const salgRel = await st(u('salg'), `INSERT INTO public.party_relationships (party_id, relationship, status, source, created_by) VALUES ($1, 'lead', 'proposed', 'manual', $2) RETURNING 1`, [P.b, U.salg])
  const montRel = await st(u('mont'), `INSERT INTO public.party_relationships (party_id, relationship, status, source, created_by) VALUES ($1, 'lead', 'proposed', 'manual', $2) RETURNING 1`, [P.b, U.mont])
  const userAi = await st(u('sl'), `INSERT INTO public.party_relationships (party_id, relationship, status, source, created_by) VALUES ($1, 'lead', 'proposed', 'ai_suggestion', $2) RETURNING 1`, [P.b, U.sl])
  add('NY', 'relation som bruger: kræver parties.manage (salg/montør afvist); bruger kan ikke oprette source=ai_suggestion', !salgRel.ok && !montRel.ok && !userAi.ok, `${code(salgRel)}/${code(montRel)}/${code(userAi)}`)
  // service_role (AI/baggrund)
  const svcAiActive = await st('service', `INSERT INTO public.party_relationships (party_id, relationship, status, source) VALUES ($1, 'manufacturer', 'active', 'ai_suggestion') RETURNING 1`, [P.x])
  const svcAiProp = await keep('service', `INSERT INTO public.party_relationships (party_id, relationship, status, source, evidence) VALUES ($1, 'manufacturer', 'proposed', 'ai_suggestion', ARRAY['domæne']) RETURNING id`, [P.x])
  const aiRel = svcAiProp.ok ? svcAiProp.rows[0].id as string : null
  const svcActivate = await st('service', `UPDATE public.party_relationships SET status = 'active', confirmed_by = $2, confirmed_at = now() WHERE id = $1 RETURNING 1`, [aiRel, U.sl])
  const svcFabricate = await st('service', `INSERT INTO public.party_relationships (party_id, relationship, status, source, confirmed_by, confirmed_at, created_by) VALUES ($1, 'cooperation_partner', 'active', 'manual', $2, now(), $2) RETURNING 1`, [P.b, U.sl])
  const svcRegNoLink = await st('service', `INSERT INTO public.party_relationships (party_id, relationship, status, source) VALUES ($1, 'supplier', 'active', 'register') RETURNING 1`, [P.m])
  const svcForgeClaims = await st({ svcSub: U.sl! }, `UPDATE public.party_relationships SET status = 'active', confirmed_by = $2, confirmed_at = now() WHERE id = $1 RETURNING 1`, [aiRel, U.sl])
  add('NY', 'AI/service_role: ai_suggestion kun som proposed; kan ALDRIG aktivere (heller ikke med bekræfter-felt)', !svcAiActive.ok && svcAiProp.ok && !svcActivate.ok, `${code(svcAiActive)}/${code(svcAiProp)}/${code(svcActivate)}`)
  add('NY', 'service_role kan ikke fabrikere en aktiv manuel relation eller en register-relation uden kobling', !svcFabricate.ok && !svcRegNoLink.ok && !svcForgeClaims.ok, `${code(svcFabricate)}/${code(svcRegNoLink)}/${code(svcForgeClaims)}`)
  const userActNoConf = await st(u('sl'), `UPDATE public.party_relationships SET status = 'active' WHERE id = $1 RETURNING 1`, [aiRel])
  const userActOther = await st(u('sl'), `UPDATE public.party_relationships SET status = 'active', confirmed_by = $2, confirmed_at = now() WHERE id = $1 RETURNING 1`, [aiRel, U.adm])
  const userAct = await st(u('sl'), `UPDATE public.party_relationships SET status = 'active', confirmed_by = $2, confirmed_at = now() WHERE id = $1 RETURNING confirmed_by = $2 AS me, source`, [aiRel, U.sl])
  const salgAct = await st(u('salg'), `UPDATE public.party_relationships SET status = 'active', confirmed_by = $2, confirmed_at = now() WHERE id = $1 RETURNING 1`, [aiRel, U.salg])
  add('NY', 'menneskelig aktivering af AI-forslag: kun med den indloggede som bekræfter (registreres); uden/anden bekræfter afvist; salg kan ikke', !userActNoConf.ok && !userActOther.ok && userAct.ok && userAct.rows[0]?.me === true && userAct.rows[0]?.source === 'ai_suggestion' && refused(salgAct),
    `${code(userActNoConf)}/${code(userActOther)}/${code(userAct)}/${code(salgAct)}`)
  const relImmut = await st(u('sl'), `UPDATE public.party_relationships SET source = 'register' WHERE id = $1 RETURNING 1`, [aiRel])
  add('NY', 'relationens kilde/part/type kan ikke ændres bagefter (forslag kan ikke "hvidvaskes" til register)', !relImmut.ok, code(relImmut))

  // ----- SAGSDELTAGERE (Sag 1: A kunde, X leverandør, Y partner, M producent, S underleverandør)
  const feedOf = async (kind: string, p: string | null) => { const r = await st('service', `SELECT * FROM public.external_feed($1, $2::uuid)`, [kind, p]); return r.ok ? r.rows : null }
  const preFeedM = await feedOf('manufacturer', P.m)
  const cp = await keep(u('sl'), `INSERT INTO public.case_participants (service_case_id, party_id, role, created_by) VALUES ($1, $2, 'customer', $7), ($1, $3, 'supplier', $7), ($1, $4, 'cooperation_partner', $7), ($1, $5, 'manufacturer', $7), ($1, $6, 'subcontractor', $7) RETURNING 1`,
    [K.c1, P.a, P.x, P.y, P.m, P.s, U.sl])
  add('NY', 'serviceleder tilføjer 5 deltagere til Sag 1', cp.ok && cp.rows.length === 5, code(cp))
  const postFeedM = await feedOf('manufacturer', P.m)
  const postFeeds: Array<any[] | null> = []
  for (const [k, p] of [['customer', P.a], ['supplier', P.x], ['partner', P.y], ['subcontractor', P.s]]) postFeeds.push(await feedOf(k, p))
  add('NY', 'sagsdeltagelse giver NUL ekstern læsning (alle 5 feeds tomme før offentliggørelse)', preFeedM?.length === 0 && postFeedM?.length === 0 && postFeeds.every((f) => f?.length === 0), JSON.stringify([preFeedM?.length, postFeedM?.length, ...postFeeds.map((f) => f?.length)]))
  const montCp = await st(u('mont'), `INSERT INTO public.case_participants (service_case_id, party_id, role, created_by) VALUES ($1, $2, 'internal', $3) RETURNING 1`, [K.c1, P.b, U.mont])
  const salgCp = await st(u('salg'), `INSERT INTO public.case_participants (service_case_id, party_id, role, created_by) VALUES ($1, $2, 'internal', $3) RETURNING 1`, [K.c1, P.b, U.salg])
  const cpSee = async (k: keyof typeof U) => { const r = await st(u(k), `SELECT count(*)::int n FROM public.case_participants WHERE service_case_id = $1`, [K.c1]); return r.ok ? r.rows[0].n as number : -1 }
  const cpVis = { sl: await cpSee('sl'), adm: await cpSee('adm'), salg: await cpSee('salg'), mont: await cpSee('mont'), bog: await cpSee('bog') }
  const anonCp = await st('anon', `SELECT 1 FROM public.case_participants`)
  add('NY', 'deltagere følger KUN medarbejderrettigheder: serviceleder/admin/bogholderi (cases.view.all) ser 5; salg (sag ikke i scope)/montør ser 0; anon afvist; montør/salg kan ikke tilføje', cpVis.sl === 5 && cpVis.adm === 5 && cpVis.bog === 5 && cpVis.salg === 0 && cpVis.mont === 0 && !anonCp.ok && !montCp.ok && !salgCp.ok,
    `${JSON.stringify(cpVis)} anon=${code(anonCp)} mont=${code(montCp)} salg=${code(salgCp)}`)
  const visAfter = { mont: await seeP('mont'), salg: await seeP('salg'), bog: await seeP('bog') }
  add('NY', 'parter (synlige/heraf ikke-kunde X·M·S·U): admin/serviceleder 7/4 (parties.manage); montør 0/0 før og efter sagskobling (ingen vilkårlige leverandører/partnere); salg/bogholderi 7/4 = intern partsliste via customers.view.all (kun læsning — beslutning D-1)',
    vis.adm === '7/4' && vis.sl === '7/4' && vis.mont === '0/0' && visAfter.mont === '0/0' && vis.salg === '7/4' && visAfter.salg === '7/4' && vis.bog === '7/4' && visAfter.bog === '7/4',
    `før=${JSON.stringify(vis)} efter=${JSON.stringify(visAfter)}`)

  // ----- OFFENTLIGGØRELSER (menneske via publish_external)
  const pub = async (who: Who, kind: string, p: string, kase: string | null, ck: string, body: string | null, doc: string | null = null, from: [string, string] | null = null) =>
    keep(who, `SELECT public.publish_external($1, $2::uuid, $3::uuid, $4, 'Titel', $5, $6::uuid, $7, $8::uuid) id`, [kind, p, kase, ck, body, doc, from?.[0] ?? null, from?.[1] ?? null])
  const ok_ = (r: Res) => (r.ok ? r.rows[0].id as string : null)
  const PUB = {
    a: ok_(await pub(u('sl'), 'customer', P.a, K.c1, 'status_update', 'SAFE-A: montage uge 49')),
    aDoc: ok_(await pub(u('sl'), 'customer', P.a, K.c1, 'document', null, D.shared)),
    x: ok_(await pub(u('sl'), 'supplier', P.x, K.c1, 'message', 'SAFE-X: bekræft leveringsdato', null, ['incoming_emails', EM.sup])),
    y: ok_(await pub(u('sl'), 'partner', P.y, K.c1, 'status_update', 'SAFE-Y: materialer bestilt')),
    m: ok_(await pub(u('sl'), 'manufacturer', P.m, K.c1, 'message', 'SAFE-M: serienummer-forespørgsel')),
    s: ok_(await pub(u('sl'), 'subcontractor', P.s, K.c1, 'message', 'SAFE-S: adgang tirsdag kl. 8')),
    salgA: ok_(await pub(u('salg'), 'customer', P.a, K.c3, 'message', 'SAFE-A3: tak for din besked')),
  }
  add('NY', '7 offentliggørelser af mennesker (serviceleder 6 på Sag 1; salg 1 på egen Sag 3 — portal.publish-standard virker)', Object.values(PUB).every(Boolean), JSON.stringify(Object.entries(PUB).filter(([, v]) => !v).map(([k]) => k)))
  const audit = await one(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'external_publication_published' AND entity_id = ANY ($1::uuid[])`, [Object.values(PUB).filter(Boolean)])
  const pubBy = await one(`SELECT count(*) FILTER (WHERE published_by = $2)::int sl, count(*) FILTER (WHERE published_by = $3)::int salg FROM public.external_publications WHERE id = ANY ($1::uuid[])`, [Object.values(PUB).filter(Boolean), U.sl, U.salg])
  add('NY', 'hver offentliggørelse: audit-række + published_by = den indloggede', audit.n === 7 && pubBy.sl === 6 && pubBy.salg === 1, `audit=${audit.n} sl=${pubBy.sl} salg=${pubBy.salg}`)
  const negPub: Array<[string, Res]> = [
    ['Kunde B på Sag 1', await pub(u('sl'), 'customer', P.b, K.c1, 'message', 'x')],
    ['partner-type til leverandør X', await pub(u('sl'), 'partner', P.x, K.c1, 'message', 'x')],
    ['kunde-type til partner Y', await pub(u('sl'), 'customer', P.y, K.c1, 'message', 'x')],
    ['leverandør X på Sag 2', await pub(u('sl'), 'supplier', P.x, K.c2, 'message', 'x')],
    ['producent-type til underleverandør S', await pub(u('sl'), 'manufacturer', P.s, K.c1, 'message', 'x')],
    ['urelateret part U som partner', await pub(u('sl'), 'partner', P.u, K.c1, 'message', 'x')],
    ['tom tekst', await pub(u('sl'), 'customer', P.a, K.c1, 'message', '   ')],
    ['montør (ingen portal.publish)', await pub(u('mont'), 'customer', P.a, K.c1, 'message', 'x')],
    ['bogholderi (ingen portal.publish)', await pub(u('bog'), 'customer', P.a, K.c1, 'message', 'x')],
    ['salg på Sag 1 (ikke i scope)', await pub(u('salg'), 'customer', P.a, K.c1, 'message', 'x')],
    ['anon', await pub('anon', 'customer', P.a, K.c1, 'message', 'x')],
    ['service_role (AI/baggrund)', await pub('service', 'customer', P.a, K.c1, 'message', 'AI-svar')],
    ['service_role med påklistret sub + claim-rolle authenticated', await st({ svcSub: U.sl! }, `SELECT public.publish_external('customer', $1::uuid, $2::uuid, 'message', 'T', 'AI', NULL, NULL, NULL) id`, [P.a, K.c1], false,
      [[`SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [JSON.stringify({ sub: U.sl, role: 'authenticated' })]]])],
  ]
  const leaked = negPub.filter(([, r]) => !refused(r))
  add('NY', `publish_external afviser ${negPub.length} ugyldige forsøg (forkert sag/part/type, uden ret/scope, anon, service_role inkl. forfalskede claims)`, leaked.length === 0, leaked.map(([k, r]) => `${k}=${code(r)}`).join(' | ') || negPub.map(([, r]) => code(r)).join(','))

  // ----- DIREKTE ANGREB på external_publications
  const ins = `INSERT INTO public.external_publications (audience_kind, audience_party_id, content_kind, body, published_by) VALUES ('customer', $1, 'message', 'x', $2) RETURNING 1`
  const atk: Array<[string, Res]> = [
    ['anon INSERT', await st('anon', ins, [P.a, U.sl])],
    ['authenticated INSERT', await st(u('sl'), ins, [P.a, U.sl])],
    ['authenticated INSERT med elta.publish=on', await st(u('sl'), ins, [P.a, U.sl], false, [[`SELECT set_config('elta.publish', 'on', true)`, []]])],
    ['service_role INSERT', await st('service', ins, [P.a, U.sl])],
    ['service_role INSERT med elta.publish=on + påklistret sub/authenticated-claims', await st({ svcSub: U.sl! }, ins, [P.a, U.sl], false,
      [[`SELECT set_config('elta.publish', 'on', true), set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [JSON.stringify({ sub: U.sl, role: 'authenticated' })]]])],
    ['authenticated UPDATE body', await st(u('sl'), `UPDATE public.external_publications SET body = 'ændret' WHERE id = $1 RETURNING 1`, [PUB.a])],
    ['authenticated UPDATE audience_party_id', await st(u('sl'), `UPDATE public.external_publications SET audience_party_id = $2 WHERE id = $1 RETURNING 1`, [PUB.a, P.b])],
    ['service_role UPDATE body', await st('service', `UPDATE public.external_publications SET body = 'ændret' WHERE id = $1 RETURNING 1`, [PUB.a])],
    ['service_role UPDATE revoked_at', await st('service', `UPDATE public.external_publications SET revoked_at = now(), revoked_by = $2 WHERE id = $1 RETURNING 1`, [PUB.a, U.sl])],
    ['anon DELETE', await st('anon', `DELETE FROM public.external_publications WHERE id = $1 RETURNING 1`, [PUB.a])],
    ['authenticated DELETE', await st(u('sl'), `DELETE FROM public.external_publications WHERE id = $1 RETURNING 1`, [PUB.a])],
    ['service_role DELETE', await st('service', `DELETE FROM public.external_publications WHERE id = $1 RETURNING 1`, [PUB.a])],
    ['service_role revoke-funktion', await st('service', `SELECT public.revoke_external_publication($1)`, [PUB.a])],
    ['montør revoke-funktion', await st(u('mont'), `SELECT public.revoke_external_publication($1)`, [PUB.a])],
  ]
  const atkLeak = atk.filter(([, r]) => !refused(r))
  add('NY', `direkte angreb på external_publications afvist (${atk.length}: INSERT/UPDATE/DELETE som anon/authenticated/service_role, elta.publish-omgåelse, revoke uden ret)`, atkLeak.length === 0, atkLeak.map(([k, r]) => `${k}=${code(r)}`).join(' | ') || atk.map(([, r]) => code(r)).join(','))
  // owner-niveau: værnet afviser selv uden grants (forsvar i dybden)
  const ownerIns = await st('owner', ins, [P.a, U.sl])
  const ownerUpd = await st('owner', `UPDATE public.external_publications SET body = 'ændret' WHERE id = $1 RETURNING 1`, [PUB.a])
  add('NY', 'forsvar i dybden: værnet afviser INSERT/indholdsændring selv for tabelejeren uden publish_external', !ownerIns.ok && !ownerUpd.ok, `${code(ownerIns)}/${code(ownerUpd)}`)

  // ----- FEED-MATRIX (service_role = portal-serveren efter token → part)
  const kinds = ['customer', 'supplier', 'partner', 'manufacturer', 'subcontractor']
  const diag: Record<string, [string, string[]]> = { customer: [P.a, [PUB.a!, PUB.aDoc!, PUB.salgA!]], supplier: [P.x, [PUB.x!]], partner: [P.y, [PUB.y!]], manufacturer: [P.m, [PUB.m!]], subcontractor: [P.s, [PUB.s!]] }
  const parties7: Array<[string, string]> = [['A', P.a], ['B', P.b], ['Y', P.y], ['X', P.x], ['M', P.m], ['S', P.s], ['U', P.u]]
  const matrixFails: string[] = []
  let cells = 0
  for (const k of kinds) {
    for (const [pn, pid] of parties7) {
      const f = await feedOf(k, pid); cells++
      const got = JSON.stringify((f ?? []).map((r) => r.id).sort())
      const want = diag[k][0] === pid ? JSON.stringify([...diag[k][1]].sort()) : '[]'
      if (got !== want) matrixFails.push(`${k}/${pn}: ${f ? f.length : 'fejl'}`)
    }
    const fNull = await feedOf(k, null); cells++
    if ((fNull ?? [1]).length !== 0) matrixFails.push(`${k}/NULL`)
  }
  add('NY', `feed-matrix ${cells} celler (5 publikumstyper × 7 parter + NULL): A ser kun A (3), X kun X, Y kun Y, M kun M, S kun S; B, U og alle krydskald tomme`, matrixFails.length === 0, matrixFails.join(' | '))
  const fA = (await feedOf('customer', P.a)) ?? []
  const cols = fA.length ? Object.keys(fA[0]) : []
  add('NY', 'feed-projektion: kun sikre felter (ingen derived_from_*, published_by, revoked_*, file_url, customer_id)', cols.length > 0 && !cols.some((c) => /derived|published_by|revoked|file_url|storage|customer_id|audience/.test(c)), cols.join(','))
  const allFeeds: any[] = []
  for (const k of kinds) allFeeds.push(...((await feedOf(k, diag[k][0])) ?? []))
  const leak = allFeeds.filter((r) => /31\.800|restordre|rabat|avance|Intern|Ordrebekr/i.test(`${r.body ?? ''} ${r.title ?? ''} ${r.document_title ?? ''}`))
  const docRow = fA.find((r) => r.content_kind === 'document')
  add('NY', 'feeds indeholder aldrig interne originaler (leverandørpris/restordre/intern note/mail-vedhæftning/internt dokument); kun den menneskeskrevne tekst', leak.length === 0 && allFeeds.length === 7, `læk=${leak.length} rækker=${allFeeds.length}`)
  add('NY', 'dokument i feedet: kun titel/filnavn/mime (ingen URL)', !!docRow && docRow.document_title === '[PROBE] Delt tegning' && docRow.document_file_name === 'tegning.pdf' && !('file_url' in docRow), docRow ? Object.keys(docRow).join(',') : 'mangler')
  const authFeed = await st(u('sl'), `SELECT * FROM public.external_feed('customer', $1)`, [P.a])
  const anonFeed = await st('anon', `SELECT * FROM public.external_feed('customer', $1)`, [P.a])
  add('NY', 'external_feed kan ikke kaldes af authenticated eller anon (kun portal-serveren)', !authFeed.ok && !anonFeed.ok, `${code(authFeed)}/${code(anonFeed)}`)
  // sag 1 med ALLE parter (også B og U) koblet → ingen udvidelse
  const linkAll = await keep(u('sl'), `INSERT INTO public.case_participants (service_case_id, party_id, role, created_by) VALUES ($1, $2, 'site_contact', $4), ($1, $3, 'internal', $4), ($1, $5, 'payer', $4), ($1, $6, 'end_customer', $4) RETURNING 1`, [K.c1, P.b, P.u, U.sl, P.x, P.y])
  const after: string[] = []
  for (const k of kinds) for (const [pn, pid] of parties7) {
    const f = await feedOf(k, pid)
    const want = diag[k][0] === pid ? diag[k][1].length : 0
    if ((f ?? []).length !== want) after.push(`${k}/${pn}=${f?.length}`)
  }
  add('NY', 'ALLE parter koblet til Sag 1 (B som site_contact, U intern, X som betaler, Y som slutkunde) → feeds uændrede', linkAll.ok && after.length === 0, `${code(linkAll)} ${after.join(' | ')}`)
  // klasse/kilde-part på en henvendelse giver ingen synlighed — testes i klasse-afsnittet
  // tilbagetrækning
  const rv1 = await keep(u('sl'), `SELECT public.revoke_external_publication($1)`, [PUB.y])
  const rvAt = (await one(`SELECT revoked_at FROM public.external_publications WHERE id = $1`, [PUB.y]))?.revoked_at
  const rv2 = await keep(u('sl'), `SELECT public.revoke_external_publication($1)`, [PUB.y])
  const rvAt2 = (await one(`SELECT revoked_at, revoked_by = $2 AS me FROM public.external_publications WHERE id = $1`, [PUB.y, U.sl])) ?? {}
  const unrevoke = await st(u('sl'), `UPDATE public.external_publications SET revoked_at = NULL, revoked_by = NULL WHERE id = $1 RETURNING 1`, [PUB.y])
  const unrevokeOwner = await st('owner', `UPDATE public.external_publications SET revoked_at = NULL, revoked_by = NULL WHERE id = $1 RETURNING 1`, [PUB.y])
  const rvAudit = (await one(`SELECT count(*)::int n FROM public.audit_logs WHERE action = 'external_publication_revoked' AND entity_id = $1`, [PUB.y])).n
  const fYafter = await feedOf('partner', P.y)
  add('NY', 'tilbagetrækning: forsvinder fra Y\'s feed; kun én gyldig tilbagetrækning (gentagelse no-op, 1 audit, tidspunkt uændret); kan ikke fortrydes', rv1.ok && rv2.ok && fYafter?.length === 0 && rvAudit === 1 && String(rvAt) === String(rvAt2.revoked_at) && rvAt2.me === true && !unrevoke.ok && !unrevokeOwner.ok,
    `${code(rv1)}/${code(rv2)}/feed=${fYafter?.length}/audit=${rvAudit}/${code(unrevoke)}/${code(unrevokeOwner)}`)
  const endRel = await keep(u('sl'), `UPDATE public.party_relationships SET status = 'ended' WHERE party_id = $1 AND relationship = 'manufacturer' AND status = 'active' RETURNING 1`, [P.m])
  const fMafter = await feedOf('manufacturer', P.m)
  add('NY', 'afsluttet relation: M er ikke længere publikum (feed tomt, uden tilbagetrækning)', endRel.ok && fMafter?.length === 0, `${code(endRel)}/${fMafter?.length}`)

  // ----- DOKUMENTVÆRN
  const docNeg: Array<[string, Res]> = [
    ['mail-vedhæftning (source_email_id)', await pub(u('sl'), 'customer', P.a, K.c1, 'document', null, D.mail)],
    ['dokument fra Kunde B/Sag 2 på Sag 1', await pub(u('sl'), 'customer', P.a, K.c1, 'document', null, D.caseB)],
    ['Sag 2-dokument til leverandør X på Sag 1', await pub(u('sl'), 'supplier', P.x, K.c1, 'document', null, D.caseB)],
    ['Kunde B-dokument til Kunde A uden sag', await pub(u('sl'), 'customer', P.a, null, 'document', null, D.custB)],
    ['Kunde B-dokument til Kunde B på Sag 1 (anden parts sag)', await pub(u('sl'), 'customer', P.b, K.c1, 'document', null, D.caseB)],
    ['ikke-eksisterende dokument', await pub(u('sl'), 'customer', P.a, K.c1, 'document', null, await id())],
  ]
  if (docInternalTypeId) docNeg.push(['document_type=internal', await pub(u('sl'), 'customer', P.a, K.c1, 'document', null, docInternalTypeId)])
  const docLeak = docNeg.filter(([, r]) => !refused(r))
  add('NY', `dokumentværn: ${docNeg.length} ugyldige dokument-offentliggørelser afvist`, docLeak.length === 0, docLeak.map(([k, r]) => `${k}=${code(r)}`).join(' | ') || docNeg.map(([, r]) => code(r)).join(','))
  if (!docInternalTypeId) add('NY', `document_type='internal' kan slet ikke eksistere i prod (${code(docInternalType)}) — publish/feed afviser den desuden i koden`, !docInternalType.ok, code(docInternalType))
  const docShared2 = await pub(u('sl'), 'supplier', P.x, K.c1, 'document', null, D.shared)
  add('NY', 'tilladt dokument (Sag 1, delt, ingen mail-kilde) kan offentliggøres eksplicit til en Sag 1-deltager', docShared2.ok, code(docShared2))
  // dokument der bliver mail-vedhæftning EFTER offentliggørelse → feedet re-tjekker
  const toMail = await keep('owner', `UPDATE public.customer_documents SET source_email_id = $2 WHERE id = $1 RETURNING 1`, [D.shared, EM.sup])
  const fAdoc = await feedOf('customer', P.a)
  add('NY', 'feed re-tjekker dokumentet ved læsning (bliver det en mail-vedhæftning, forsvinder det)', (fAdoc ?? []).every((r) => r.content_kind !== 'document') && (fAdoc ?? []).length === 2 && toMail.ok, `${code(toMail)}/${fAdoc?.length}`)

  // ----- STAGE A + KLASSEPRÆCEDENS (rigtig reception_ingest som service_role)
  const thr = `p254-thread-${stamp}`
  const m = { m1: await id(), m2: await id(), m3: await id() }
  await q(`INSERT INTO public.incoming_emails (id, graph_message_id, subject, sender_email, received_at, conversation_id) VALUES
    ($1, 'p254-m1-' || $4, '[PROBE] 254 tråd', 'p254-x@harness.test', now() - interval '2 hours', $3),
    ($2, 'p254-m2-' || $4, 'Re: [PROBE] 254 tråd', 'p254-x@harness.test', now() - interval '1 hour', $3)`, [m.m1, m.m2, thr, stamp])
  await q(`INSERT INTO public.incoming_emails (id, graph_message_id, subject, sender_email, received_at, customer_id, linked_by, link_status) VALUES ($1, 'p254-m3-' || $3, '[PROBE] 254 auto', 'p254-b@harness.test', now() - interval '1 hour', $2, 'auto', 'linked')`, [m.m3, C.b, stamp])
  const ingest = (p: object) => keep('service', `SELECT public.reception_ingest($1::jsonb) r`, [JSON.stringify(p)])
  const i1 = await ingest({ source_table: 'incoming_emails', source_id: m.m1, title: '[PROBE] 254', preview: 'uddrag', customer_match_state: 'no_match' })
  const c1 = i1.ok ? (i1.rows[0].r?.conversation_id as string) : null
  const i1b = await ingest({ source_table: 'incoming_emails', source_id: m.m1 })
  const i2 = await ingest({ source_table: 'incoming_emails', source_id: m.m2, title: 'Re', actions: [{ action_type: 'create_task', policy_outcome: 'auto', idempotency_key: `p254:${stamp}:task`, execute: true }] })
  const i3 = await ingest({ source_table: 'incoming_emails', source_id: m.m3 })
  const c3 = i3.ok ? (i3.rows[0].r?.conversation_id as string) : null
  const st1 = c1 ? await one(`SELECT (SELECT count(*)::int FROM public.conversation_items WHERE conversation_id = $1) items, (SELECT state::text FROM public.conversation_actions WHERE conversation_id = $1 AND idempotency_key = $2) act,
      source_party_id IS NULL AS np, communication_class || '/' || communication_class_source AS cls FROM public.conversations WHERE id = $1`, [c1, `p254:${stamp}:task`]) : null
  const st3 = c3 ? await one(`SELECT coalesce(customer_id::text, 'null') = 'null' AS no_cust, customer_match_state::text s, (customer_candidate_id = $2) cand FROM public.conversations WHERE id = $1`, [c3, C.b]) : null
  add('UÆNDRET', 'Stage A under 00254: ny mail → created (NULL/unknown/none); samme levering → duplicate; svar i tråd → samme henvendelse (2 items)',
    i1.ok && i1.rows[0].r?.outcome === 'created' && i1b.ok && i1b.rows[0].r?.outcome === 'duplicate' && i2.ok && i2.rows[0].r?.conversation_id === c1 && st1?.items === 2 && st1?.np === true && st1?.cls === 'unknown/none',
    `${code(i1)}:${i1.ok ? i1.rows[0].r?.outcome : ''}/${i1b.ok ? i1b.rows[0].r?.outcome : code(i1b)}/${i2.ok ? i2.rows[0].r?.outcome : code(i2)}/${JSON.stringify(st1)}`)
  add('UÆNDRET', 'Stage A under 00254: AI-handling "auto+execute" forbliver proposed (intet udføres/sendes); auto-koblet mail → kun KANDIDAT', st1?.act === 'proposed' && st3?.no_cust === true && st3?.cand === true, `${st1?.act}/${JSON.stringify(st3)}`)
  // Henvendelser-handlinger som serviceleder (præcis samme UPDATE-form som src/lib/actions/henvendelser.ts)
  const mv = c3 ? (await one(`SELECT match_version FROM public.conversations WHERE id = $1`, [c3])).match_version as number : 0
  const confirm = c3 ? await keep(u('sl'), `UPDATE public.conversations SET customer_id = $2, customer_match_state = 'confirmed', customer_candidate_id = NULL, match_version = $3 + 1, service_case_id = NULL, case_candidate_id = NULL, case_match_state = 'none', status = 'open' WHERE id = $1 AND match_version = $3 AND status <> 'handled' RETURNING 1`, [c3, C.b, mv]) : { ok: false, code: 'ingen' } as Res
  const caseConf = c3 ? await keep(u('sl'), `UPDATE public.conversations SET service_case_id = $2, case_match_state = 'confirmed', case_candidate_id = NULL, match_version = $3 + 2 WHERE id = $1 AND match_version = $3 + 1 AND customer_id = $4 RETURNING 1`, [c3, K.c2, mv, C.b]) : { ok: false, code: 'ingen' } as Res
  const assign = c1 ? await keep(u('sl'), `UPDATE public.conversations SET assigned_profile_id = $2, assigned_team = NULL WHERE id = $1 RETURNING 1`, [c1, U.sl]) : { ok: false, code: 'ingen' } as Res
  const handled = c1 ? await keep(u('sl'), `UPDATE public.conversations SET status = 'handled', handled_at = now(), handled_by = $2, next_action = NULL WHERE id = $1 AND status <> 'handled' RETURNING 1`, [c1, U.sl]) : { ok: false, code: 'ingen' } as Res
  const reopen = c1 ? await keep(u('sl'), `UPDATE public.conversations SET status = 'open', handled_at = NULL, handled_by = NULL WHERE id = $1 AND status <> 'open' RETURNING 1`, [c1]) : { ok: false, code: 'ingen' } as Res
  add('UÆNDRET', 'Henvendelser-handlinger under 00254 (bekræft kunde, bekræft sag, tildel, afslut, genåbn) virker uændret', [confirm, caseConf, assign, handled, reopen].every((r) => r.ok && r.rows.length === 1), [confirm, caseConf, assign, handled, reopen].map(code).join(','))
  // sync-lease (00253) uændret under 00254
  const la = await keep('service', `SELECT public.sync_lease_acquire('email-sync-p254', 330) h`)
  const lb = await st('service', `SELECT public.sync_lease_acquire('email-sync-p254', 330) h`)
  const lr = la.ok ? await keep('service', `SELECT public.sync_lease_release('email-sync-p254', $1::uuid) r`, [la.rows[0].h]) : la
  add('UÆNDRET', '00253 sync-lease uændret under 00254 (holder/optaget/frigivelse)', la.ok && !!la.rows[0].h && lb.ok && lb.rows[0].h === null && lr.ok && lr.rows[0].r === true, `${code(la)}/${lb.ok ? lb.rows[0].h : code(lb)}/${lr.ok ? lr.rows[0].r : code(lr)}`)
  // klassepræcedens: manual > deterministic > ai > none
  if (c1) {
    const cls = (who: Who, c: string, s: string, extra = '') => st(who, `UPDATE public.conversations SET communication_class = $2, communication_class_source = $3${extra} WHERE id = $1 RETURNING 1`, [c1, c, s])
    const clsK = (who: Who, c: string, s: string, extra = '') => keep(who, `UPDATE public.conversations SET communication_class = $2, communication_class_source = $3${extra} WHERE id = $1 RETURNING 1`, [c1, c, s])
    const sAi = await clsK('service', 'customer_request', 'ai')
    const sAiOverAi = await cls('service', 'lead', 'ai')
    const sDet = await clsK('service', 'supplier_correspondence', 'deterministic')
    const sAiOverDet = await cls('service', 'customer_request', 'ai')
    const sNoneOverDet = await cls('service', 'unknown', 'none')
    const sManual = await cls('service', 'customer_request', 'manual')
    const sForgedManual = await cls({ svcSub: U.sl! }, 'customer_request', 'manual')
    const uDet = await cls(u('sl'), 'purchase_material', 'deterministic')
    const uAi = await cls(u('sl'), 'purchase_material', 'ai')
    const uManual = await clsK(u('sl'), 'purchase_material', 'manual', `, source_party_id = '${P.x}'`)
    const sDetOverMan = await cls('service', 'supplier_correspondence', 'deterministic')
    const sAiOverMan = await cls('service', 'customer_request', 'ai')
    const montManual = await cls(u('mont'), 'lead', 'manual')
    const fin = await one(`SELECT communication_class || '/' || communication_class_source AS c, source_party_id = $2 AS p FROM public.conversations WHERE id = $1`, [c1, P.x])
    add('NY', 'klasse: server ai → deterministic ok; ai over deterministic, none over deterministic og server-sat manual afvist (også med forfalsket sub)',
      sAi.ok && sDet.ok && !sAiOverDet.ok && !sNoneOverDet.ok && !sManual.ok && !sForgedManual.ok && sAiOverAi.ok,
      [sAi, sAiOverAi, sDet, sAiOverDet, sNoneOverDet, sManual, sForgedManual].map(code).join(','))
    add('NY', 'klasse: bruger kan kun sætte manual; server (deterministic/ai) kan ikke overskrive manual',
      !uDet.ok && !uAi.ok && uManual.ok && !sDetOverMan.ok && !sAiOverMan.ok && fin.c === 'purchase_material/manual' && fin.p === true,
      [uDet, uAi, uManual, sDetOverMan, sAiOverMan].map(code).join(',') + ` → ${fin.c}`)
    if (montManual.ok && montManual.rows.length) notTestable('montør manuel klasse', 'montør ramte en synlig henvendelse — klassen er intern og giver ingen synlighed')
    // klassifikation/kilde-part giver ALDRIG portalsynlighed
    const pubsBefore = (await one(`SELECT count(*)::int n FROM public.external_publications`)).n
    await keep(u('sl'), `UPDATE public.conversations SET communication_class = 'customer_request', communication_class_source = 'manual', source_party_id = $2 WHERE id = $1 RETURNING 1`, [c1, P.b])
    const fB = await feedOf('customer', P.b)
    const pubsAfter = (await one(`SELECT count(*)::int n FROM public.external_publications`)).n
    add('NY', 'klassifikation + kilde-part = Kunde B (manuelt) giver ingen offentliggørelse og intet i B\'s feed', fB?.length === 0 && pubsAfter === pubsBefore, `feed=${fB?.length} pubs ${pubsBefore}→${pubsAfter}`)
  } else add('NY', 'klassepræcedens', false, 'ingen henvendelse fra reception_ingest')

  // ----- RETTIGHEDS-OVERRIDES (effektive rettigheder, ikke rå roller)
  const ov = (uid: string, perm: string, effect: string) => `INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ('${uid}', '${perm}', '${effect}', 'manual', 'rollback-prøve 00254')`
  const withOv = async (sql: string, who: Who, test: string, params: unknown[] = []) => {
    await q('SAVEPOINT ov'); await q(sql)
    const r = await st(who, test, params)
    await q('ROLLBACK TO SAVEPOINT ov'); return r
  }
  const montGrant = await withOv(ov(U.mont!, 'parties.manage', 'grant'), u('mont'), `INSERT INTO public.parties (kind, display_name, created_by) VALUES ('person', 'ov', $1) RETURNING 1`, [U.mont])
  const salgRevoke = await withOv(ov(U.salg!, 'portal.publish', 'revoke'), u('salg'), `SELECT public.publish_external('customer', $1::uuid, $2::uuid, 'message', 'T', 'x', NULL, NULL, NULL)`, [P.a, K.c3])
  const slRevoke = await withOv(ov(U.sl!, 'parties.manage', 'revoke'), u('sl'), `INSERT INTO public.parties (kind, display_name, created_by) VALUES ('person', 'ov', $1) RETURNING 1`, [U.sl])
  const bogGrant = await withOv(ov(U.bog!, 'portal.publish', 'grant'), u('bog'), `SELECT public.user_has_permission('portal.publish') v`)
  add('NY', 'overrides virker: montør+parties.manage kan oprette part; salg−portal.publish kan ikke offentliggøre; serviceleder−parties.manage kan ikke oprette; bogholderi+portal.publish får nøglen',
    montGrant.ok && !salgRevoke.ok && !slRevoke.ok && bogGrant.ok && bogGrant.rows[0].v === true, [montGrant, salgRevoke, slRevoke].map(code).join(',') + `/${bogGrant.ok ? bogGrant.rows[0].v : code(bogGrant)}`)

  // ================= rul testdata tilbage (migrationen bliver) → rollback-SQL
  await q('ROLLBACK TO SAVEPOINT tests')
  const left = await one(`SELECT (SELECT count(*) FROM public.parties) + (SELECT count(*) FROM public.party_relationships) + (SELECT count(*) FROM public.case_participants) + (SELECT count(*) FROM public.external_publications) n`)
  add('NY', 'testdata væk efter savepoint-rollback (0 rækker i nye tabeller)', Number(left.n) === 0, String(left.n))
  try { await q(RB_BODY) } catch (e) { add('NY', 'rollback-SQL kører rent', false, (e as { code?: string }).code ?? 'fejl'); return }
  const obj2 = (await one(OBJ)).j
  const struct2 = (await one(`SELECT ${STRUCT_MD5} s`)).s as string
  const fp2 = await one(FP)
  add('NY', 'rollback: 4 tabeller, 3 kolonner, 9 funktioner, 3 triggere, politikker og 2 nøgler væk', obj2.tables === 0 && obj2.conv_cols === 0 && obj2.fns === 0 && obj2.triggers === 0 && obj2.policies === 0 && obj2.keys === 0 && JSON.stringify(obj2.pairs) === '[]', JSON.stringify(obj2))
  add('NY', `rollback: katalog/standarder gendannet (${obj2.catalog}/${obj2.defaults})`, obj2.catalog === obj0.catalog && obj2.defaults === obj0.defaults, `${obj0.catalog}/${obj0.defaults}`)
  add('NY', 'rollback: struktur-md5 af hele public-skemaet = før (bit-for-bit)', struct2 === struct0, `${struct2.slice(0, 8)}… vs ${struct0.slice(0, 8)}…`)
  add('NY', 'rollback: alle 22 data-fingeraftryk = før', FP_TABLES.every((k) => fp0[k] === fp2[k]), FP_TABLES.filter((k) => fp0[k] !== fp2[k]).join(','))
  console.log(`  varighed: ${((Date.now() - t0) / 1000).toFixed(1)} s (låse holdt i denne periode; alt rulles nu tilbage)`)
  } catch (e) {
    add('NY', `ABORT — prøven stoppede (transaktionen rulles tilbage) ved: ${lastSql}`, false, `${(e as { code?: string }).code ?? ''} ${(e as Error).message?.slice(0, 120) ?? ''}`)
  }
}))
