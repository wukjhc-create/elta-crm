/**
 * PRODUCTION read-only: kilder til arbejdskost — kostbasis, medarbejdere med/uden kostgrundlag, time_logs med kost 0.
 * Kun antal (ingen navne/beløb pr. person).   npx tsx scripts/prod-labour-cost-sources.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-labour-cost-sources', async (run, masked) => {
  const r = await run(`SELECT
      (SELECT time_cost_basis FROM company_settings ORDER BY created_at NULLS LAST LIMIT 1) basis,
      (SELECT time_cost_rate IS NOT NULL FROM company_settings ORDER BY created_at NULLS LAST LIMIT 1) has_fixed_rate,
      (SELECT count(*) FROM employees WHERE active) active_employees,
      (SELECT count(*) FROM employee_compensation ec JOIN employees e ON e.id = ec.employee_id WHERE e.active) with_comp,
      (SELECT count(*) FROM employee_compensation ec JOIN employees e ON e.id = ec.employee_id WHERE e.active AND coalesce(ec.real_hourly_cost,0) = 0) comp_rhc_zero,
      (SELECT count(*) FROM employee_compensation ec JOIN employees e ON e.id = ec.employee_id WHERE e.active AND ec.internal_cost_rate IS NOT NULL) comp_internal_set,
      (SELECT count(*) FROM time_logs WHERE end_time IS NOT NULL) closed_logs,
      (SELECT count(*) FROM time_logs WHERE end_time IS NOT NULL AND coalesce(cost_rate_snapshot,0) = 0) logs_cost_zero,
      (SELECT count(*) FROM time_logs WHERE end_time IS NOT NULL AND cost_rate_snapshot = 400) logs_cost_400,
      (SELECT count(*) FROM calculation_rows WHERE hours IS NOT NULL) calc_labour_rows,
      (SELECT count(*) FROM calculation_rows WHERE (hours IS NOT NULL) AND cost_price = 295) calc_rows_295`)
  console.log(`--- arbejdskost-kilder @ prod:${masked} ---`)
  console.log(JSON.stringify(r[0], null, 1))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
