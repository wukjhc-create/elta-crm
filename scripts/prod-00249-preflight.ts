/**
 * 00249 (Henvendelser / AI-receptionist) — PRODUCTION READ ONLY (én READ ONLY-transaktion, prod-readonly.ts). Intet apply.
 *   npx tsx scripts/prod-00249-preflight.ts pre|post [--save <fil>]
 * pre:  ingen 00249-objekter (tabeller/funktioner/politikker/indeks/triggere/nøgler), forudsætninger findes, tællinger,
 *       kollisioner, data- og struktur-fingeraftryk (--save gemmer dem til sammenligning efter dry-run/prod)
 * post: 00249 anvendt som forventet (4 tabeller m. RLS, 9 funktioner, ACL, ingen anon/PUBLIC, +3 nøgler/+10 standarder),
 *       0 rækker i de nye tabeller, data-fingeraftryk = pre
 * Ingen personværdier ud — kun antal, md5 og strukturtjek.
 */
import { writeFileSync } from 'fs'
import { withProdReadOnly } from './prod-readonly'
import { STRUCT_MD5 } from './test-harness/reception-00249-probe'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'
const saveIdx = process.argv.indexOf('--save')
const TABLES = ['conversations', 'conversation_items', 'conversation_actions', 'upload_requests']
const T = `(${TABLES.map((t) => `'${t}'`).join(',')})`
const FNS = ['conversations_guard', 'conversation_items_guard', 'conversation_actions_guard', 'conversation_actions_insert_guard', 'upload_requests_guard',
  'conversation_visible', 'reception_source_identity', 'reception_source_visible', 'reception_ingest']
const F = `(${FNS.map((f) => `'${f}'`).join(',')})`
import { FP_00249, FP_00249_SQL } from './prod-00249-preflight-shared'

withProdReadOnly(`prod-00249-preflight ${mode}`, async (run) => {
  const res: Array<[string, boolean, string]> = []
  const cat = (await run(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p`))[0]
  console.log(`INFO  katalog: ${cat.k} nøgler / ${cat.p} rollestandarder`)
  const fp = (await run(FP_00249_SQL))[0]
  for (const [t] of FP_00249) console.log(`INFO  fp ${t}: ${fp[t]}`)
  const struct = (await run(`SELECT ${STRUCT_MD5} s`))[0].s
  console.log(`INFO  struktur-md5 (public): ${struct}`)
  const c = (await run(`SELECT
    (SELECT count(*)::int FROM customers) customers, (SELECT count(*)::int FROM service_cases) cases,
    (SELECT count(*)::int FROM incoming_emails) mails,
    (SELECT count(*)::int FROM incoming_emails WHERE customer_id IS NULL AND link_status::text <> 'ignored') mails_unlinked,
    (SELECT count(*)::int FROM incoming_emails WHERE customer_id IS NOT NULL AND linked_by = 'manual') mails_manual,
    (SELECT count(*)::int FROM incoming_emails WHERE customer_id IS NOT NULL AND linked_by IS DISTINCT FROM 'manual') mails_auto,
    (SELECT count(*)::int FROM incoming_emails WHERE sender_email ~* '@formsubmit\\.co$' AND subject ~* 'henvendelse') mails_web,
    (SELECT count(*)::int FROM portal_messages) portal, (SELECT count(*)::int FROM portal_messages WHERE sender_type = 'customer') portal_customer,
    (SELECT count(*)::int FROM portal_messages WHERE sender_type = 'customer' AND created_at IS NULL) portal_no_ts,
    (SELECT count(*)::int FROM telephony_calls) calls, (SELECT count(*)::int FROM telephony_events) call_events,
    (SELECT count(*)::int FROM customer_documents) docs, (SELECT count(*)::int FROM sms_messages) sms`))[0]
  console.log(`INFO  tællinger: ${JSON.stringify(c)}`)
  const roles = await run(`SELECT role, count(*)::int n FROM profiles WHERE is_active GROUP BY role ORDER BY role`)
  console.log(`INFO  aktive profiler pr. rolle: ${roles.map((r) => `${r.role}=${r.n}`).join(', ')}`)

  // Forudsætninger (00249's guard-blok kræver dem)
  const pre = (await run(`SELECT
    to_regprocedure('public.user_has_permission(text)') IS NOT NULL a, to_regprocedure('public.my_customer_scope_ids()') IS NOT NULL b,
    to_regprocedure('public.my_case_scope_ids()') IS NOT NULL c, to_regprocedure('auth.role()') IS NOT NULL d, to_regprocedure('auth.uid()') IS NOT NULL e,
    to_regclass('public.telephony_calls') IS NOT NULL f, to_regclass('public.incoming_invoices') IS NOT NULL g, to_regclass('public.customer_contacts') IS NOT NULL h`))[0]
  res.push(['forudsætninger: hjælpefunktioner, auth.role/uid, telephony_calls, incoming_invoices, customer_contacts', Object.values(pre).every(Boolean), JSON.stringify(pre)])
  const keys = await run(`SELECT permission k FROM permission_catalog WHERE permission IN ('customers.view.all','customers.view','customers.edit','customers.emails.view','inbox.view','calls.view','calls.view_unmatched','cases.view.all','incoming_invoices.view','tasks.create') ORDER BY 1`)
  res.push(['nøgler som synlighedsreglerne bruger findes (10)', keys.length === 10, keys.map((k) => k.k).join(',')])
  const srcPol = await run(`SELECT tablename t, count(*)::int n FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('incoming_emails','telephony_calls','portal_messages') AND cmd = 'SELECT' GROUP BY 1 ORDER BY 1`)
  console.log(`INFO  kilde-SELECT-politikker: ${srcPol.map((x) => `${x.t}=${x.n}`).join(', ')}`)
  const mailPol = (await run(`SELECT coalesce(string_agg(qual, ' '), '') q FROM pg_policies WHERE schemaname = 'public' AND tablename = 'incoming_emails' AND cmd = 'SELECT'`))[0].q as string
  res.push(['incoming_emails SELECT = 00246 (reception_source_visible spejler den)', mailPol.includes("'incoming_invoices.view'") && mailPol.includes('my_case_scope_ids') && !/user_role\(\)/.test(mailPol), ''])
  const callPol = (await run(`SELECT coalesce(string_agg(qual, ' '), '') q FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telephony_calls' AND cmd = 'SELECT'`))[0].q as string
  res.push(['telephony_calls SELECT = 00247 (calls.view_unmatched + calls.view + scope)', callPol.includes('calls.view_unmatched') && callPol.includes('my_customer_scope_ids'), ''])
  const portalPol = (await run(`SELECT coalesce(string_agg(coalesce(qual, '') || '@' || roles::text, ' '), '') q FROM pg_policies WHERE schemaname = 'public' AND tablename = 'portal_messages' AND cmd = 'SELECT'`))[0].q as string
  res.push(['portal_messages SELECT for authenticated = true (som spejlet)', portalPol.includes('true@{authenticated}'), portalPol.slice(0, 80)])

  // 00249-objekter og kollisioner
  const rel = await run(`SELECT relname || ':' || relkind::text r FROM pg_class WHERE relnamespace = 'public'::regnamespace AND (relname IN ${T} OR relname LIKE 'conversation%' OR relname LIKE 'upload_request%') ORDER BY 1`)
  const fns = await run(`SELECT proname f FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (proname IN ${F} OR proname LIKE 'reception\\_%') ORDER BY 1`)
  const trg = await run(`SELECT tgname t FROM pg_trigger WHERE NOT tgisinternal AND (tgname LIKE 'trg_conversation%' OR tgname LIKE 'trg_upload_request%') ORDER BY 1`)
  const pol = await run(`SELECT tablename || ':' || policyname p FROM pg_policies WHERE schemaname = 'public' AND tablename IN ${T} ORDER BY 1`)
  const nk = await run(`SELECT permission k FROM permission_catalog WHERE permission LIKE 'conversations.%' ORDER BY 1`)
  const nd = await run(`SELECT role || ':' || permission d FROM role_permission_defaults WHERE permission LIKE 'conversations.%' ORDER BY 1`)
  const guc = (await run(`SELECT current_setting('reception.ingest', true) v`))[0].v
  if (mode === 'pre') {
    res.push(['ingen 00249-tabeller/-indeks/-sekvenser (navne conversation*/upload_request*)', rel.length === 0, rel.map((x) => x.r).join(',')])
    res.push(['ingen 00249-funktioner (inkl. reception_*)', fns.length === 0, fns.map((x) => x.f).join(',')])
    res.push(['ingen 00249-triggere', trg.length === 0, trg.map((x) => x.t).join(',')])
    res.push(['ingen politikker på 00249-tabeller', pol.length === 0, ''])
    res.push(['ingen conversations.*-nøgler/-standarder', nk.length === 0 && nd.length === 0, `${nk.length}/${nd.length}`])
    res.push(['GUC reception.ingest er ikke sat (marker kun inde i reception_ingest)', guc === null || guc === '', String(guc)])
    res.push(['kilde-unikhed: nye unikke indeks ligger KUN på de nye (tomme) tabeller — ingen eksisterende rækker kan kollidere', rel.length === 0, 'n/a'])
  } else {
    const tabs = await run(`SELECT relname || ':' || relrowsecurity t FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ${T} AND relkind = 'r' ORDER BY 1`)
    res.push(['4 tabeller med RLS', tabs.map((x) => x.t).join(',') === 'conversation_actions:true,conversation_items:true,conversations:true,upload_requests:true', tabs.map((x) => x.t).join(',')])
    res.push(['9 funktioner', fns.length === 9, fns.map((x) => x.f).join(',')])
    const g = await run(`SELECT table_name || ':' || grantee || ':' || privilege_type g FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ${T} AND grantee IN ('anon', 'PUBLIC') ORDER BY 1`)
    res.push(['ingen tabel-grants til anon/PUBLIC', g.length === 0, g.map((x) => x.g).join(',')])
    const ag = await run(`SELECT table_name || ':' || privilege_type g FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ${T} AND grantee = 'authenticated' ORDER BY 1`)
    res.push(['authenticated: SELECT/UPDATE henvendelser, SELECT items, SELECT/INSERT/UPDATE handlinger, intet tabel-grant på upload_requests',
      ag.map((x) => x.g).join(',') === 'conversation_actions:INSERT,conversation_actions:SELECT,conversation_actions:UPDATE,conversation_items:SELECT,conversations:SELECT,conversations:UPDATE', ag.map((x) => x.g).join(',')])
    const ex = await run(`SELECT p.proname n, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u, has_function_privilege('service_role', p.oid, 'EXECUTE') s FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ${F} ORDER BY 1`)
    const exec = ex.map((x) => `${x.n}:${x.a ? 'A' : '-'}${x.u ? 'U' : '-'}${x.s ? 'S' : '-'}`).join(',')
    res.push(['EXECUTE: anon intet; authenticated kun reception_ingest + conversation_visible', ex.every((x) => !x.a) && ex.filter((x) => x.u).map((x) => x.n).join(',') === 'conversation_visible,reception_ingest', exec])
    const rows = (await run(`SELECT (SELECT count(*) FROM conversations)::int a, (SELECT count(*) FROM conversation_items)::int b, (SELECT count(*) FROM conversation_actions)::int c, (SELECT count(*) FROM upload_requests)::int d`))[0]
    res.push(['0 rækker i de nye tabeller (dormant)', rows.a + rows.b + rows.c + rows.d === 0, JSON.stringify(rows)])
    res.push(['3 nøgler + 10 standarder', nk.length === 3 && nd.length === 10, `${nk.length}/${nd.length}`])
  }
  if (saveIdx > 0 && process.argv[saveIdx + 1]) {
    writeFileSync(process.argv[saveIdx + 1], JSON.stringify({ catalog: cat, fp, struct, counts: c }, null, 2))
    console.log(`INFO  gemt: ${process.argv[saveIdx + 1]}`)
  }
  for (const [id, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${note ? ` — ${note}` : ''}`)
  process.exitCode = res.some((r) => !r[1]) ? 2 : 0
}).catch((e) => { console.error(String(e?.message ?? e).replace(/postgres(ql)?:\/\/[^\s]+/gi, '<db-url>')); process.exitCode = 1 })
