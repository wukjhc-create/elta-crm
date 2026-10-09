/**
 * PRODUCTION read-only: tabeller hvor authenticated (eller public) kan LÆSE alle rækker (SELECT/ALL-politik med
 * qual = true) — kandidater til DB-niveau-stramning. Kun tabelnavne + rækkeantal-estimat, ingen data.
 *   npx tsx scripts/prod-open-select-tables.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-open-select-tables', async (run, masked) => {
  const rows = await run(`SELECT p.tablename tbl, string_agg(DISTINCT p.policyname, ', ') policies,
      max(c.reltuples)::bigint est_rows
    FROM pg_policies p JOIN pg_class c ON c.relname = p.tablename AND c.relnamespace = 'public'::regnamespace
    WHERE p.schemaname = 'public' AND p.cmd IN ('SELECT', 'ALL')
      AND (p.roles @> ARRAY['authenticated']::name[] OR p.roles @> ARRAY['public']::name[])
      AND btrim(coalesce(p.qual, '')) IN ('true', '(true)')
    GROUP BY p.tablename ORDER BY p.tablename`)
  console.log(`--- tabeller læsbare for alle indloggede (qual = true) @ prod:${masked} ---`)
  for (const r of rows as Array<{ tbl: string; policies: string; est_rows: number }>) console.log(`${r.tbl.padEnd(36)} ~${String(r.est_rows).padStart(7)} rk  (${r.policies.slice(0, 80)})`)
  console.log(`I alt: ${rows.length}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
