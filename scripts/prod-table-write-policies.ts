/**
 * PRODUCTION read-only: INSERT/UPDATE/DELETE-politikker + kolonne-skriveret for authenticated på givne tabeller. Ingen data.
 *   npx tsx scripts/prod-table-write-policies.ts service_cases case_materials
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const tables = process.argv.slice(2).filter((t) => /^[a-z_]+$/.test(t))
withProdReadOnly('prod-table-write-policies', async (run, masked) => {
  const pols = await run(`SELECT tablename, policyname, cmd, coalesce(qual, '-') qual, coalesce(with_check, '-') chk FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (${tables.map((t) => `'${t}'`).join(',')}) AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL') ORDER BY 1, 3`)
  console.log(`--- skrive-politikker @ prod:${masked} ---`)
  for (const p of pols as Array<{ tablename: string; policyname: string; cmd: string; qual: string; chk: string }>) {
    console.log(`${p.tablename} ${p.cmd} ${p.policyname}\n   USING ${p.qual.slice(0, 220)}\n   CHECK ${p.chk.slice(0, 220)}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
