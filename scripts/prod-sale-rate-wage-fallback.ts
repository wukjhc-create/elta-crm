/**
 * PRODUCTION read-only: RBAC-review 2026-10-07 — 00096-triggeren sætter employees.hourly_rate = COALESCE(sales_rate,
 * hourly_wage). Uden salgssats bliver LØNNEN medarbejderens salgssats (time_logs.sale_rate_snapshot → fakturering, og
 * synlig for salg). Hvor mange medarbejdere/timer er ramt? Kun antal — ingen satser ud.
 *   npx tsx scripts/prod-sale-rate-wage-fallback.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-sale-rate-wage-fallback', async (run, masked) => {
  const rows = await run(`SELECT
      count(*)::int compensations,
      count(*) FILTER (WHERE c.sales_rate IS NULL AND c.hourly_wage IS NOT NULL)::int wage_fallback,
      count(*) FILTER (WHERE c.sales_rate IS NULL AND c.hourly_wage IS NOT NULL AND e.hourly_rate = c.hourly_wage)::int employee_rate_equals_wage,
      (SELECT count(*)::int FROM time_logs t JOIN employee_compensation c2 ON c2.employee_id = t.employee_id
        WHERE c2.sales_rate IS NULL AND c2.hourly_wage IS NOT NULL AND t.sale_rate_snapshot = c2.hourly_wage) time_logs_priced_at_wage
    FROM employee_compensation c JOIN employees e ON e.id = c.employee_id`)
  console.log(`--- salgssats = løn-fallback @ prod:${masked} ---`)
  console.table(rows)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
