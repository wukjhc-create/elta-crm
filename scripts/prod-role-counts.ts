/**
 * PRODUCTION read-only: antal aktive profiler pr. rolle (+ montører med koblet aktiv medarbejder). Kun antal.
 *   npx tsx scripts/prod-role-counts.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-role-counts', async (run, masked) => {
  const rows = await run(`SELECT p.role, count(*) FILTER (WHERE p.is_active) aktive,
      count(*) FILTER (WHERE p.is_active AND EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = p.id AND e.active)) med_medarbejder
    FROM profiles p GROUP BY p.role ORDER BY p.role`)
  console.log(`--- roller @ prod:${masked} ---`)
  for (const r of rows) console.log(JSON.stringify(r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
