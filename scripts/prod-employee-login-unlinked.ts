/**
 * PRODUCTION read-only: fund 2026-10-07 — "Gem stamdata" på en medarbejder afkoblede login'et (profile_id → null).
 * Hvor mange medarbejdere står uden kobling, selvom der findes et login med samme e-mail? Kun antal.
 *   npx tsx scripts/prod-employee-login-unlinked.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-employee-login-unlinked', async (run, masked) => {
  const rows = await run(`SELECT
      count(*)::int employees,
      count(*) FILTER (WHERE e.profile_id IS NULL)::int without_login,
      count(*) FILTER (WHERE e.profile_id IS NULL AND EXISTS (SELECT 1 FROM profiles p
        WHERE lower(p.email) = lower(e.email) AND NOT EXISTS (SELECT 1 FROM employees e2 WHERE e2.profile_id = p.id)))::int unlinked_with_matching_login,
      count(*) FILTER (WHERE e.profile_id IS NULL AND e.active AND EXISTS (SELECT 1 FROM profiles p
        WHERE lower(p.email) = lower(e.email) AND NOT EXISTS (SELECT 1 FROM employees e2 WHERE e2.profile_id = p.id)))::int active_unlinked_with_matching_login
    FROM employees e`)
  console.log(`--- medarbejdere uden login-kobling @ prod:${masked} ---`)
  console.table(rows)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
