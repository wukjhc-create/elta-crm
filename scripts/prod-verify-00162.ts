/**
 * PRODUCTION read-only verifikation af migration 00162 (P-004 anon-eksponering) — struktur OG adfaerd.
 *   npm run prod:verify-00162
 *
 * 1) Rettigheds-matrix (katalog): anon har INGEN adgang til de beroerte views/tabeller/funktioner; authenticated
 *    har stadig den forventede. 2) Adfaerd som anon: hver flade proeves i sin egen READ ONLY-session med role=anon
 *    og skal afvises. 3) Adfaerd som en rigtig admin: de samme flader kan laeses, og antallet svarer til service-
 *    forbindelsens (security_invoker + RLS skjuler intet for admin). Ingen skrivning; alt afsluttes med ROLLBACK.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const VIEWS = ['v_calc_components_summary', 'v_import_batches_summary', 'v_kalkia_calculations_summary', 'v_kalkia_nodes_summary',
  'v_packages_summary', 'v_supplier_products_with_supplier', 'v_supplier_sync_jobs']
const CATALOGS = ['package_categories', 'product_catalog', 'product_categories', 'project_templates']
const LOG_TABLES = ['email_events', 'sms_events', 'integration_logs']
// [signatur, authenticated skal have EXECUTE | null = uden betydning]
// handle_new_user: 00162 fjerner kun PUBLIC/anon. authenticated har EXECUTE i prod, men funktionen returnerer
// `trigger` og kan derfor ikke kaldes direkte (PG: "trigger functions can only be called as triggers") — det
// verificeres nedenfor i stedet for at antage det.
const FUNCS: Array<[string, boolean | null]> = [
  ['public.handle_new_user()', null],
  ['public.log_audit_event(uuid, text, text, text, uuid, text, text, text, jsonb, jsonb, text, text)', true],
  ['public.user_employee_id(uuid)', true],
  ['public.user_has_permission(text, uuid)', true],
  ['public.user_has_role(text[], uuid)', true],
  ['public.user_permissions(uuid)', true],
  ['public.user_role(uuid)', true],
  ['public.is_admin()', true],
  ['public.agent_action_effective_approvals(uuid)', false],
  ['public.agent_action_is_executable(uuid, integer)', false],
]
const uuidRe = /^[0-9a-f-]{36}$/i

async function main() {
  const problems: string[] = []
  const expect = (cond: boolean, label: string) => { console.log(`  ${cond ? '✓' : '❌'} ${label}`); if (!cond) problems.push(label) }

  // ---- 1) struktur / rettigheder
  const base = await withProdReadOnly('prod-verify-00162', async (run, masked) => {
    console.log(`--- 00162 @ prod:${masked} — rettigheder ---`)
    for (const v of VIEWS) {
      const r = (await run(`SELECT coalesce(array_to_string(c.reloptions, ','), '') AS opts,
          has_table_privilege('anon', c.oid, 'SELECT') AS anon_sel, has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_sel
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = '${v}'`))[0]
      expect(!!r && /security_invoker=(true|on)/.test(r.opts) && !r.anon_sel && r.auth_sel, `${v}: security_invoker, anon SELECT=nej, authenticated SELECT=ja`)
    }
    for (const t of CATALOGS) {
      const r = (await run(`SELECT has_table_privilege('anon', 'public.${t}', 'SELECT') AS anon_sel, has_table_privilege('authenticated', 'public.${t}', 'SELECT') AS auth_sel`))[0]
      expect(!r.anon_sel && r.auth_sel, `${t}: anon SELECT=nej, authenticated SELECT=ja`)
    }
    for (const t of LOG_TABLES) {
      const r = (await run(`SELECT has_table_privilege('anon', 'public.${t}', 'INSERT') OR has_table_privilege('anon', 'public.${t}', 'UPDATE')
          OR has_table_privilege('anon', 'public.${t}', 'DELETE') AS anon_write,
        (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = '${t}' AND 'anon' = ANY(roles)) AS anon_pol`))[0]
      expect(!r.anon_write && Number(r.anon_pol) === 0, `${t}: anon skrive=nej, anon-policies=${r.anon_pol}`)
    }
    for (const [sig, authExpected] of FUNCS) {
      const r = (await run(`SELECT has_function_privilege('anon', '${sig}', 'EXECUTE') AS anon_x, has_function_privilege('authenticated', '${sig}', 'EXECUTE') AS auth_x,
          has_function_privilege('service_role', '${sig}', 'EXECUTE') AS svc_x,
          (SELECT coalesce(array_to_string(proconfig, ','), '') FROM pg_proc WHERE oid = '${sig}'::regprocedure) AS cfg,
          (SELECT prorettype::regtype::text FROM pg_proc WHERE oid = '${sig}'::regprocedure) AS rettype`))[0]
      const name = sig.split('(')[0].replace('public.', '')
      const yn = (b: boolean) => (b ? 'ja' : 'nej')
      expect(!r.anon_x && (authExpected === null || r.auth_x === authExpected) && r.svc_x,
        `${name}: anon EXECUTE=${yn(r.anon_x)} · authenticated=${yn(r.auth_x)}${authExpected === null ? ' (uden betydning)' : ''} · service_role=${yn(r.svc_x)}`)
      if (authExpected === null) expect(r.rettype === 'trigger', `${name}: returnerer ${r.rettype} → kan ikke kaldes direkte af nogen rolle`)
      if (name === 'handle_new_user' || name === 'log_audit_event') expect(/search_path=/.test(r.cfg), `${name}: search_path laast (${r.cfg || 'intet'})`)
    }
    const admin = (await run(`SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id
      WHERE p.role = 'admin' AND coalesce(p.is_active, true) AND coalesce(u.email, '') NOT LIKE '%@harness.test' ORDER BY p.created_at NULLS LAST LIMIT 1`))[0]
    const totals: Record<string, number> = {}
    for (const v of [...VIEWS, ...CATALOGS]) totals[v] = Number((await run(`SELECT count(*) AS n FROM public.${v}`))[0].n)
    return { adminId: admin?.id as string | undefined, totals }
  })

  // ---- 2) adfaerd som anon (én session pr. flade: en afvisning aborterer transaktionen)
  console.log('--- adfaerd som anon ---')
  const anonTry = async (label: string, sql: string) => {
    let outcome = ''
    try {
      await withProdReadOnly(`prod-verify-00162-anon`, async (run) => {
        await run(`SELECT set_config('request.jwt.claims', '{"role":"anon"}', true)`)
        await run(`SELECT set_config('role', 'anon', true)`)
        const r = await run(sql)
        outcome = `TILLADT (${JSON.stringify(r[0] ?? {}).slice(0, 40)})`
      })
    } catch (e) {
      const m = maskDbError(e)
      outcome = /permission denied/i.test(m) ? 'afvist' : `FEJL ${m.slice(0, 60)}`
    }
    expect(outcome === 'afvist', `anon ${label}: ${outcome}`)
  }
  for (const v of [...VIEWS, ...CATALOGS]) await anonTry(`laeser ${v}`, `SELECT count(*) AS n FROM public.${v}`)
  await anonTry('kalder user_role', `SELECT public.user_role('00000000-0000-0000-0000-000000000000'::uuid) AS r`)
  await anonTry('kalder is_admin', `SELECT public.is_admin() AS r`)
  await anonTry('kalder user_permissions', `SELECT public.user_permissions('00000000-0000-0000-0000-000000000000'::uuid) AS r`)
  // log_audit_event kaldes IKKE som anon: lykkedes det, ville kaldet selv vaere en forfalskning (read-only ville
  // afvise skrivningen, men vi tester ikke adgangen ved forsoeg). Rettigheden er verificeret i matrixen ovenfor.

  // ---- 3) adfaerd som rigtig admin (authenticated)
  if (!base.adminId || !uuidRe.test(base.adminId)) {
    expect(false, 'fandt en aktiv admin-profil til adfaerdstest')
  } else {
    await withProdReadOnly('prod-verify-00162-admin', async (run) => {
      const claims = JSON.stringify({ sub: base.adminId, role: 'authenticated' }).replace(/'/g, "''")
      await run(`SELECT set_config('request.jwt.claims', '${claims}', true)`)
      await run(`SELECT set_config('role', 'authenticated', true)`)
      const who = (await run(`SELECT current_user AS cu, public.user_role() AS r, public.is_admin() AS a`))[0]
      console.log(`--- adfaerd som admin (${who.cu}, user_role=${who.r}) ---`)
      expect(who.cu === 'authenticated' && who.r === 'admin' && who.a === true, 'authenticated kan kalde user_role()/is_admin()')
      for (const v of [...VIEWS, ...CATALOGS]) {
        const n = Number((await run(`SELECT count(*) AS n FROM public.${v}`))[0].n)
        expect(n === base.totals[v], `admin laeser ${v}: ${n}/${base.totals[v]}`)
      }
    })
  }

  console.log(problems.length ? `\n=== 00162 PROD: ❌ ${problems.length} afvigelse(r) ===` : '\n=== 00162 PROD: ✅ 0 anon-eksponering, authenticated uaendret (ingen skrivning udfoert) ===')
  process.exitCode = problems.length ? 2 : 0
}

main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
