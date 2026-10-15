/**
 * PRODUCTION read-only: aktive medarbejdere uden timepris (salg) / kostpris, og tidsregistreringer frosset med
 * trigger-fallback (495/400) — kun tal, ingen navne. PR-4b (Henrik 2026-10-15).   npx tsx scripts/prod-employee-rate-gaps.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-employee-rate-gaps', async (run, masked) => {
  const e = (await run(`SELECT count(*) FILTER (WHERE active)::int aktive,
      count(*) FILTER (WHERE active AND hourly_rate IS NULL)::int uden_timepris,
      count(*) FILTER (WHERE active AND cost_rate IS NULL)::int uden_kostpris,
      count(*) FILTER (WHERE active AND profile_id IS NOT NULL AND hourly_rate IS NULL)::int login_uden_timepris
    FROM public.employees`)) as Array<Record<string, number>>
  const t = (await run(`SELECT count(*)::int timer, count(*) FILTER (WHERE e.hourly_rate IS NULL AND tl.end_time IS NOT NULL)::int frosset_med_salgsfallback,
      count(*) FILTER (WHERE e.cost_rate IS NULL AND tl.end_time IS NOT NULL)::int frosset_med_kostfallback
    FROM public.time_logs tl LEFT JOIN public.employees e ON e.id = tl.employee_id`)) as Array<Record<string, number>>
  console.log(`prod:${masked} medarbejdere ${JSON.stringify(e[0])} · timer ${JSON.stringify(t[0])}`)
}).catch((err) => { console.error(maskDbError(err)); process.exitCode = 1 })
