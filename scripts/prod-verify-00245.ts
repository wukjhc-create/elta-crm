/**
 * 00245 (customer_notes efter nutidens rettighedsmodel) — PRODUCTION READ ONLY (én READ ONLY-transaktion).
 *   npx tsx scripts/prod-verify-00245.ts pre|post
 * pre:  tabellen findes ikke (eller viser dens tilstand), case_notes.source, forudsatte hjælpere/nøgler, fingeraftryk
 * post: tabel/kolonner/indeks, PRÆCIS de fire politikker (ingen USING (true), ingen user_role()), grants (anon/PUBLIC
 *       intet; authenticated UPDATE kun content), ny nøgle + rollestandarder, case_notes uændret bortset fra kolonnen
 * Ingen personværdier ud — kun antal, md5 og strukturtjek.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'

withProdReadOnly(`prod-verify-00245 ${mode}`, async (run) => {
  const res: Array<[string, boolean, string]> = []
  const exists = (await run(`SELECT to_regclass('public.customer_notes')::text AS t`))[0].t !== null
  const src = (await run(`SELECT data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='case_notes' AND column_name='source'`))[0] ?? null
  const fns = (await run(`SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('user_has_permission','my_customer_scope_ids')`))[0].n
  const keys = (await run(`SELECT count(*)::int n FROM permission_catalog WHERE permission IN ('customers.view','customers.view.all','customers.edit')`))[0].n
  const manage = (await run(`SELECT count(*)::int n FROM permission_catalog WHERE permission='customers.notes.manage'`))[0].n
  // case_notes uden den nye kolonne (pre/post skal være ens for eksisterende rækker)
  const fp = (await run(`SELECT count(*)::int n, md5(coalesce(string_agg((to_jsonb(c) - 'source')::text, '|' ORDER BY c.id), '')) m FROM case_notes c`))[0]
  console.log(`INFO  case_notes: ${fp.n} rækker, md5(uden source)=${fp.m}`)
  const cs = (await run(`SELECT (SELECT count(*)::int FROM customers) cn, (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM customers x) cm,
    (SELECT count(*)::int FROM service_cases) sn, (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM service_cases x) sm`))[0]
  console.log(`INFO  customers: ${cs.cn} rækker, md5=${cs.cm} · service_cases: ${cs.sn} rækker, md5=${cs.sm}`)
  if (exists) {
    const cn = (await run(`SELECT count(*)::int n, md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) m FROM customer_notes x`))[0]
    console.log(`INFO  customer_notes: ${cn.n} rækker, md5=${cn.m}`)
  }
  console.log(`INFO  customer_notes findes: ${exists ? 'ja' : 'nej'} · case_notes.source: ${src ? JSON.stringify(src) : 'mangler'} · customers.notes.manage i katalog: ${manage}`)
  res.push(['hjælpere user_has_permission/my_customer_scope_ids findes', fns === 2, `${fns}/2`])
  res.push(['nøgler customers.view/.view.all/.edit findes', keys === 3, `${keys}/3`])

  if (mode === 'post') {
    const cols = await run(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='customer_notes' ORDER BY column_name`)
    res.push(['customer_notes har id, customer_id, content, source, created_by, created_at', cols.map((c) => c.column_name).join(',') === 'content,created_at,created_by,customer_id,id,source', cols.map((c) => c.column_name).join(',')])
    const pol = await run(`SELECT policyname, cmd, coalesce(qual,'') q, coalesce(with_check,'') w, roles::text r FROM pg_policies
      WHERE schemaname='public' AND tablename='customer_notes' ORDER BY policyname`)
    res.push(['præcis fire politikker (select/insert/update/delete _scope)', pol.map((p) => p.policyname).join(',') === 'customer_notes_delete_scope,customer_notes_insert_scope,customer_notes_select_scope,customer_notes_update_scope', pol.map((p) => p.policyname).join(',')])
    res.push(['ingen USING (true) / user_role() i politikkerne', pol.every((p) => p.q !== 'true' && !/user_role\(\)/.test(p.q + p.w)), ''])
    res.push(['alle politikker kun for authenticated', pol.every((p) => p.r === '{authenticated}'), pol.map((p) => p.r).join(',')])
    const tg = await run(`SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='customer_notes' AND grantee IN ('anon','authenticated','PUBLIC') ORDER BY 1,2`)
    res.push(['anon/PUBLIC uden tabel-grants', tg.every((g) => g.grantee === 'authenticated'), tg.filter((g) => g.grantee !== 'authenticated').map((g) => `${g.grantee}:${g.privilege_type}`).join(',')])
    res.push(['authenticated: SELECT, INSERT, DELETE (ingen tabel-UPDATE)', tg.filter((g) => g.grantee === 'authenticated').map((g) => g.privilege_type).join(',') === 'DELETE,INSERT,SELECT', tg.map((g) => g.privilege_type).join(',')])
    const cu = await run(`SELECT column_name FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='customer_notes'
      AND grantee='authenticated' AND privilege_type='UPDATE' ORDER BY 1`)
    res.push(['authenticated UPDATE kun på content', cu.map((c) => c.column_name).join(',') === 'content', cu.map((c) => c.column_name).join(',')])
    res.push(['case_notes.source findes (text, NOT NULL, default manual)', !!src && src.data_type === 'text' && src.is_nullable === 'NO' && /manual/.test(String(src.column_default)), JSON.stringify(src)])
    const def = await run(`SELECT role FROM role_permission_defaults WHERE permission='customers.notes.manage' ORDER BY role`)
    res.push(['customers.notes.manage: katalog + standard admin/serviceleder', manage === 1 && def.map((d) => d.role).join(',') === 'admin,serviceleder', def.map((d) => d.role).join(',')])
    const rls = (await run(`SELECT relrowsecurity r FROM pg_class WHERE oid='public.customer_notes'::regclass`))[0].r
    res.push(['RLS slået til på customer_notes', rls === true, ''])
  } else {
    res.push(['customer_notes findes IKKE endnu (prod før 00245)', !exists, exists ? 'findes allerede' : ''])
    res.push(['customers.notes.manage findes ikke endnu', manage === 0, `${manage}`])
  }
  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} tjek som forventet — read-only`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
