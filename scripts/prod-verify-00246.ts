/**
 * 00246 (incoming_emails SELECT efter effektive rettigheder) — PRODUCTION READ ONLY (én READ ONLY-transaktion).
 *   npx tsx scripts/prod-verify-00246.ts pre|post
 * pre:  SELECT-politikken er 00180's (rå rolle, bogholderi ser alt), hjælpere/nøgler findes, fingeraftryk
 * post: præcis én SELECT-politik med de fem grene (ingen user_role(), ingen USING (true)), skrive-politikker uændret,
 *       grants uændret, katalog uændret, fingeraftryk (mails, kunder, sager, fakturaer, udgående) = pre
 * Ingen personværdier ud — kun antal, md5 og strukturtjek.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'
const md5 = (t: string) => `(SELECT count(*)::int || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM public.${t} x)`
const TABLES = ['incoming_emails', 'customers', 'service_cases', 'incoming_invoices', 'email_messages', 'emails', 'email_events', 'sent_quotes']
// Skrive-politikker og grants som de er i prod før 00246 (00170/00180) — skal være uændrede
const WRITE_POLICIES = 'incoming_emails_delete_role:DELETE,incoming_emails_insert_role:INSERT,incoming_emails_update_role:UPDATE'

withProdReadOnly(`prod-verify-00246 ${mode}`, async (run) => {
  const res: Array<[string, boolean, string]> = []
  const fp = (await run(`SELECT ${TABLES.map((t) => `${md5(t)} AS ${t}`).join(', ')}`))[0]
  for (const t of TABLES) console.log(`INFO  ${t}: ${fp[t]}`)
  const cat = (await run(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p`))[0]
  console.log(`INFO  katalog: ${cat.k} nøgler / ${cat.p} rollepar`)
  const fns = (await run(`SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('user_has_permission','my_customer_scope_ids','my_case_scope_ids')`))[0].n
  res.push(['hjælpere user_has_permission/my_customer_scope_ids/my_case_scope_ids findes', fns === 3, `${fns}/3`])
  const keys = (await run(`SELECT count(*)::int n FROM permission_catalog WHERE permission IN
    ('inbox.view','customers.emails.view','customers.view.all','customers.edit','cases.view.all','incoming_invoices.view')`))[0].n
  res.push(['de seks nøgler politikken bruger findes', keys === 6, `${keys}/6`])
  const pol = await run(`SELECT policyname, cmd, coalesce(qual,'') q, coalesce(with_check,'') w, roles::text r FROM pg_policies
    WHERE schemaname='public' AND tablename='incoming_emails' ORDER BY policyname`)
  const sel = pol.filter((p) => p.cmd === 'SELECT')
  res.push(['skrive-politikker uændrede (delete/insert/update _role)', pol.filter((p) => p.cmd !== 'SELECT').map((p) => `${p.policyname}:${p.cmd}`).join(',') === WRITE_POLICIES, ''])
  res.push(['præcis én SELECT-politik (incoming_emails_select, authenticated)', sel.length === 1 && sel[0].policyname === 'incoming_emails_select' && sel[0].r === '{authenticated}', sel.map((p) => p.policyname).join(',')])
  const q = sel[0]?.q ?? ''
  const tg = await run(`SELECT grantee || ':' || privilege_type g FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='incoming_emails' AND grantee IN ('anon','authenticated','PUBLIC') ORDER BY 1`)
  console.log(`INFO  grants: ${tg.map((g) => g.g).join(',')}`)
  const rls = (await run(`SELECT relrowsecurity r FROM pg_class WHERE oid='public.incoming_emails'::regclass`))[0].r
  res.push(['RLS slået til på incoming_emails', rls === true, ''])
  if (mode === 'post') {
    res.push(['SELECT uden user_role() og uden USING (true)', !/user_role\(\)/.test(q) && q.trim() !== 'true', ''])
    for (const k of ['inbox.view', 'customers.emails.view', 'customers.view.all', 'customers.edit', 'cases.view.all', 'incoming_invoices.view', 'my_customer_scope_ids', 'my_case_scope_ids', 'incoming_invoices ii'])
      res.push([`SELECT-politikken bruger ${k}`, q.includes(k), ''])
  } else {
    res.push(['SELECT er 00180-politikken (rå rolle inkl. bogholderi + montør via user_can_see_case)', /user_role\(\)/.test(q) && q.includes("'bogholderi'") && q.includes('user_can_see_case') && !q.includes('incoming_invoices'), q.slice(0, 80)])
  }
  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} tjek som forventet — read-only (sammenlign INFO-linjerne pre/post)`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
