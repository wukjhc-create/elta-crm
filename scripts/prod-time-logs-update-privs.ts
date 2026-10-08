/**
 * PRODUCTION read-only: kolonne-UPDATE-ret for authenticated på time_logs + UPDATE-politikker. Ingen data.
 *   npx tsx scripts/prod-time-logs-update-privs.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-time-logs-update-privs', async (run, masked) => {
  const cols = await run(`SELECT c.column_name col, has_column_privilege('authenticated', 'public.time_logs', c.column_name, 'UPDATE') upd
    FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'time_logs' ORDER BY c.ordinal_position`)
  const pols = await run(`SELECT policyname, cmd, array_to_string(roles, ',') roles, coalesce(qual, '-') qual
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'time_logs' AND cmd IN ('UPDATE', 'ALL', 'INSERT')`)
  console.log(`--- time_logs @ prod:${masked} ---`)
  console.log('UPDATE-ret (authenticated): ' + (cols as Array<{ col: string; upd: boolean }>).map((r) => `${r.col}=${r.upd ? 'JA' : 'nej'}`).join(', '))
  for (const p of pols as Array<{ policyname: string; cmd: string; roles: string; qual: string }>) console.log(`${p.cmd} ${p.policyname} [${p.roles}] ${p.qual.slice(0, 160)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
