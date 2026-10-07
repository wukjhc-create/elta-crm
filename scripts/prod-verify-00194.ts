/**
 * PRODUCTION read-only: før/efter-tjek for migration 00194 (system_alerts — notifikationsklokken).
 *   npx tsx scripts/prod-verify-00194.ts pre|post
 * Kun metadata (tabel, RLS, policies, privilegier) + antal rækker — ingen data.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'

withProdReadOnly('prod-verify-00194', async (run) => {
  const checks: Array<[string, boolean, string]> = []
  const q = async (sql: string) => (await run(`SELECT json_build_object('v', (${sql})) r`))[0].r.v
  const exists = await q(`to_regclass('public.system_alerts') IS NOT NULL`)
  if (mode === 'pre') {
    checks.push(['system_alerts findes ikke endnu', exists === false, String(exists)])
    checks.push(['user_role(uuid DEFAULT auth.uid()) findes (bruges som user_role() i policies, som 00192)', (await q(`to_regprocedure('public.user_role(uuid)') IS NOT NULL`)) === true, ''])
    checks.push(['profiles findes (FK dismissed_by)', (await q(`to_regclass('public.profiles') IS NOT NULL`)) === true, ''])
  } else {
    checks.push(['system_alerts findes', exists === true, String(exists)])
    if (exists) {
      checks.push(['RLS slået til', (await q(`(SELECT relrowsecurity FROM pg_class WHERE oid = 'public.system_alerts'::regclass)`)) === true, ''])
      const pols = String(await q(`(SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_alerts')`))
      checks.push(['præcis 2 policies (SELECT + UPDATE)', pols === 'system_alerts_select_office:SELECT,system_alerts_update_office:UPDATE', pols])
      const qual = String(await q(`(SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_alerts' AND cmd = 'SELECT')`))
      checks.push(['SELECT kun admin/serviceleder/bogholderi', /admin/.test(qual) && /serviceleder/.test(qual) && /bogholderi/.test(qual) && !/salg|montør/.test(qual), qual.slice(0, 120)])
      for (const role of ['authenticated', 'anon']) {
        for (const p of ['INSERT', 'DELETE']) {
          const can = await q(`has_table_privilege('${role}', 'public.system_alerts', '${p}')`)
          checks.push([`${role} har ikke ${p}`, can === false, String(can)])
        }
      }
      checks.push(['anon kan ikke læse', (await q(`has_table_privilege('anon', 'public.system_alerts', 'SELECT')`)) === false, ''])
      checks.push(['authenticated kan ikke ændre title', (await q(`has_column_privilege('authenticated', 'public.system_alerts', 'title', 'UPDATE')`)) === false, ''])
      checks.push(['authenticated kan ændre is_dismissed', (await q(`has_column_privilege('authenticated', 'public.system_alerts', 'is_dismissed', 'UPDATE')`)) === true, ''])
      const n = await q(`(SELECT count(*) FROM public.system_alerts)`)
      console.log(`rækker i system_alerts: ${n}`)
    }
  }
  let bad = 0
  for (const [label, ok, note] of checks) { if (!ok) bad++; console.log(`${ok ? 'OK ' : 'AFV'} ${label}${note ? `  (${note})` : ''}`) }
  console.log(bad ? `❌ ${bad} afvigelser (${mode})` : `✅ 00194 ${mode}-tjek: ${checks.length}/${checks.length}`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
