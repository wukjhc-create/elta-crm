/**
 * PRODUCTION read-only: SELECT-politikker (authenticated/public/anon) for vilkårlige tabeller. Ingen data.
 *   npx tsx scripts/prod-table-select-policies.ts leads lead_activities
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const tables = process.argv.slice(2).filter((t) => /^[a-z_][a-z0-9_]*$/.test(t))
if (tables.length === 0) { console.error('Angiv tabelnavne'); process.exit(1) }

withProdReadOnly('prod-table-select-policies', async (run, masked) => {
  const rows = await run(`SELECT p.tablename tbl, p.policyname, array_to_string(p.roles, ',') roles, p.cmd, coalesce(p.qual, '-') qual
    FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename IN (${tables.map((t) => `'${t}'`).join(',')})
      AND p.cmd IN ('SELECT', 'ALL') ORDER BY 1, 2`)
  console.log(`--- SELECT-politikker @ prod:${masked} ---`)
  for (const r of rows as Array<{ tbl: string; policyname: string; roles: string; cmd: string; qual: string }>) {
    console.log(`${r.tbl} | ${r.policyname} | ${r.roles} | ${r.cmd} | ${r.qual.slice(0, 200)}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
