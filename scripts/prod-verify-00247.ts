/**
 * 00247 (telefoni-persistens) — PRODUCTION READ ONLY (én READ ONLY-transaktion). Ingen apply her.
 *   npx tsx scripts/prod-verify-00247.ts pre|post
 * pre:  ingen telefoni-tabeller/-funktioner, ingen calls.*-nøgler, hjælpere og customers.view.all findes, fingeraftryk
 * post: tre tabeller med RLS, præcis én politik (SELECT på telephony_calls TO authenticated, effektive rettigheder),
 *       authenticated kun SELECT på opkald, intet til anon/PUBLIC, funktioner kun EXECUTE for service_role, 3 nøgler +
 *       8 standarder, triggere, 0 rækker; fingeraftryk (kunder, sager, opgaver, audit, mails, overrides) = pre
 * Ingen personværdier ud — kun antal, md5 og strukturtjek.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'
const md5 = (t: string, order = 'x.id') => `(SELECT count(*)::int || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY ${order}), '')) FROM public.${t} x)`
const FP: Array<[string, string]> = [['customers', 'x.id'], ['service_cases', 'x.id'], ['customer_tasks', 'x.id'], ['audit_logs', 'x.id'], ['incoming_emails', 'x.id'], ['user_permission_overrides', 'x.profile_id, x.permission']]
const TABLES = `('telephony_calls', 'telephony_events', 'telephony_employee_links')`
const FNS = ['telephony_ingest_event', 'telephony_set_call_match', 'telephony_purge_unconfirmed', 'telephony_calls_guard', 'telephony_events_immutable']

withProdReadOnly(`prod-verify-00247 ${mode}`, async (run) => {
  const res: Array<[string, boolean, string]> = []
  const fp = (await run(`SELECT ${FP.map(([t, o]) => `${md5(t, o)} AS ${t}`).join(', ')}`))[0]
  for (const [t] of FP) console.log(`INFO  ${t}: ${fp[t]}`)
  const cat = (await run(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p`))[0]
  console.log(`INFO  katalog: ${cat.k} nøgler / ${cat.p} rollepar`)
  const helpers = (await run(`SELECT count(*)::int n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('user_has_permission', 'my_customer_scope_ids')`))[0].n
  res.push(['hjælpere user_has_permission/my_customer_scope_ids findes', helpers >= 2, `${helpers}`])
  const viewAll = (await run(`SELECT count(*)::int n FROM permission_catalog WHERE permission = 'customers.view.all'`))[0].n
  res.push(['nøglen customers.view.all findes', viewAll === 1, ''])
  const tabs = await run(`SELECT relname || ':' || relrowsecurity t FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ${TABLES} ORDER BY 1`)
  const fns = await run(`SELECT proname || ':' || coalesce(array_to_string(proacl, ','), '') f FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN (${FNS.map((f) => `'${f}'`).join(', ')}) ORDER BY 1`)
  const keys = await run(`SELECT permission k FROM permission_catalog WHERE permission LIKE 'calls.%' ORDER BY 1`)
  const defs = await run(`SELECT role || ':' || permission d FROM role_permission_defaults WHERE permission LIKE 'calls.%' ORDER BY 1`)
  if (mode === 'pre') {
    res.push(['ingen telefoni-tabeller', tabs.length === 0, tabs.map((x) => x.t).join(',')])
    res.push(['ingen telefoni-funktioner', fns.length === 0, fns.map((x) => String(x.f).split(':')[0]).join(',')])
    res.push(['ingen calls.*-nøgler/standarder', keys.length === 0 && defs.length === 0, `${keys.length}/${defs.length}`])
  } else {
    res.push(['tre tabeller med RLS slået til', tabs.map((x) => x.t).join(',') === 'telephony_calls:true,telephony_employee_links:true,telephony_events:true', tabs.map((x) => x.t).join(',')])
    const pol = await run(`SELECT tablename, policyname, cmd, roles::text r, coalesce(qual, '') q FROM pg_policies WHERE schemaname = 'public' AND tablename IN ${TABLES}`)
    const q = String(pol[0]?.q ?? '')
    res.push(['præcis én politik: telephony_calls_select, SELECT, TO authenticated', pol.length === 1 && pol[0].policyname === 'telephony_calls_select' && pol[0].cmd === 'SELECT' && pol[0].r === '{authenticated}', pol.map((p) => p.policyname).join(',')])
    res.push(['politikken bruger calls.view_unmatched, calls.view, customers.view.all, my_customer_scope_ids — ingen user_role()/USING (true)',
      ['calls.view_unmatched', 'calls.view', 'customers.view.all', 'my_customer_scope_ids'].every((k) => q.includes(k)) && !/user_role\(\)/.test(q) && q.trim() !== 'true', ''])
    const g = await run(`SELECT table_name || ':' || grantee || ':' || privilege_type g FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ${TABLES} AND grantee IN ('anon', 'authenticated', 'PUBLIC') ORDER BY 1`)
    res.push(['grants: authenticated kun SELECT på telephony_calls; intet til anon/PUBLIC', g.map((x) => x.g).join(',') === 'telephony_calls:authenticated:SELECT', g.map((x) => x.g).join(',')])
    const exec = await run(`SELECT p.proname n, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u, has_function_privilege('service_role', p.oid, 'EXECUTE') s
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('telephony_ingest_event', 'telephony_set_call_match', 'telephony_purge_unconfirmed')`)
    res.push(['funktioner: kun service_role har EXECUTE (3)', exec.length === 3 && exec.every((x) => !x.a && !x.u && x.s), exec.map((x) => `${x.n}:${x.a}/${x.u}/${x.s}`).join(',')])
    const trg = await run(`SELECT tgname t FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.telephony_calls'::regclass, 'public.telephony_events'::regclass) ORDER BY 1`)
    res.push(['triggere telephony_calls_guard + telephony_events_immutable', trg.map((x) => x.t).join(',') === 'telephony_calls_guard,telephony_events_immutable', trg.map((x) => x.t).join(',')])
    res.push(['nøgler calls.match/view/view_unmatched', keys.map((x) => x.k).join(',') === 'calls.match,calls.view,calls.view_unmatched', ''])
    res.push(['8 standarder (admin/serviceleder alle; salg view+match)', defs.map((x) => x.d).join(',') === 'admin:calls.match,admin:calls.view,admin:calls.view_unmatched,salg:calls.match,salg:calls.view,serviceleder:calls.match,serviceleder:calls.view,serviceleder:calls.view_unmatched', ''])
    const cols = await run(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ${TABLES} AND column_name ~ '(recording|transcript|audio|payload$|raw)'`)
    res.push(['ingen lyd-/transskriptions-/rå payload-kolonner', cols[0].n === 0, `${cols[0].n}`])
    const rows = (await run(`SELECT (SELECT count(*)::int FROM telephony_calls) + (SELECT count(*)::int FROM telephony_events) + (SELECT count(*)::int FROM telephony_employee_links) n`))[0].n
    res.push(['0 telefoni-rækker', rows === 0, `${rows}`])
  }
  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} tjek som forventet — read-only (sammenlign INFO-linjerne pre/post)`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
