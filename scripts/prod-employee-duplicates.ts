/** PRODUCTION read-only: profiler med >1 AKTIV employees-række (current_employee_id() er LIMIT 1 uden ORDER BY). Kun tal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-employee-duplicates', async (run) => {
  console.log(JSON.stringify((await run(`SELECT count(*)::int profiles_with_dupes, coalesce(max(n), 0)::int max_rows FROM (SELECT profile_id, count(*) n FROM public.employees WHERE active AND profile_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d`))[0]))
  console.log(JSON.stringify((await run(`SELECT count(*)::int unique_idx FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'employees' AND indexdef ILIKE '%UNIQUE%profile_id%'`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
