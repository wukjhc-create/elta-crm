/**
 * PRODUCTION read-only: hvilke tabeller kan ENHVER indlogget skrive/slette i? (aaben skrive-policy = qual/with_check
 * 'true' for authenticated/public, eller RLS slaaet fra med skrive-grant). Supplement til prod:role-policies, som kun
 * dækker laesning. Kun tabelnavne + antal raekker — ingen data.
 *   npx tsx scripts/prod-write-policies.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-write-policies', async (run, masked) => {
  console.log(`--- åbne skrive-policies (authenticated) @ prod:${masked} ---`)
  const open = (await run(`SELECT p.tablename, string_agg(DISTINCT p.cmd, ',' ORDER BY p.cmd) cmds
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND (p.roles @> ARRAY['authenticated']::name[] OR p.roles @> ARRAY['public']::name[])
      AND (trim(coalesce(p.qual,'')) = 'true' OR trim(coalesce(p.with_check,'')) = 'true')
    GROUP BY 1 ORDER BY 1`)) as Array<{ tablename: string; cmds: string }>
  const noRls = (await run(`SELECT c.relname tablename FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
      AND (has_table_privilege('authenticated', c.oid, 'INSERT') OR has_table_privilege('authenticated', c.oid, 'UPDATE') OR has_table_privilege('authenticated', c.oid, 'DELETE'))
    ORDER BY 1`)) as Array<{ tablename: string }>
  const withDelete = open.filter((o) => /DELETE|ALL/.test(o.cmds))
  console.log(`  tabeller med åben skrive-policy: ${open.length} (heraf med DELETE/ALL: ${withDelete.length})`)
  console.log(`  tabeller UDEN RLS men med skrive-grant: ${noRls.length}${noRls.length ? ' → ' + noRls.map((t) => t.tablename).join(', ') : ''}`)
  for (const o of open) {
    const n = (await run(`SELECT count(*)::int n FROM public.${o.tablename.replace(/[^a-z0-9_]/g, '')}`))[0].n
    console.log(`  ${o.tablename.padEnd(40)} ${o.cmds.padEnd(22)} rækker=${n}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
