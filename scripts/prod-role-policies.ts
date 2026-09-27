/**
 * PRODUCTION read-only: statisk RLS-analyse af foelsomme tabeller vs. app-politikken (permissions.ts).
 *   npm run prod:role-policies
 * Samme faste forespoergsler som harness:pilot-roles' statiske del. Skriver intet. Exit 2 ved huller.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { analysePolicies, formatPolicies, READ_POLICY } from './test-harness/role-matrix'

withProdReadOnly('prod-role-policies', async (run, masked) => {
  const v = await analysePolicies(run)
  const counts: string[] = []
  for (const p of READ_POLICY) counts.push(`${p.table}=${(await run(`SELECT count(*) AS n FROM public.${p.table}`))[0].n}`)
  console.log(`--- prod:${masked} ---`)
  console.log(formatPolicies(v))
  console.log(`\nraekker: ${counts.join(' ')}`)
  const gaps = v.filter((p) => p.verdict === 'aaben' && p.disallowed.length)
  console.log(`\n=== PROD ROLLEADGANG: ${gaps.length} tabel(ler) aaben for roller app-politikken udelukker (ingen skrivning udfoert) ===`)
  process.exitCode = gaps.length ? 2 : 0
}).catch((e) => { console.error('[prod-role-policies] FEJL:', maskDbError(e)); process.exit(1) })
