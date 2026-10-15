/**
 * PRODUCTION read-only pre/post for 00229: employees.weekly_hours + checksum (ingen dataændring).
 *   npx tsx scripts/prod-check-00229.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-check-00229', async (run, masked) => {
  const col = (await run(`SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='weekly_hours'`)) as Array<{ data_type: string }>
  const sum = (await run(`SELECT count(*)::int n, md5(string_agg(id::text || ':' || coalesce(name,'-') || ':' || active::text || ':' || coalesce(hourly_rate::text,'-') || ':' || coalesce(cost_rate::text,'-'), ',' ORDER BY id)) s FROM public.employees`)) as Array<{ n: number; s: string | null }>
  console.log(`prod:${masked} weekly_hours=${col[0]?.data_type ?? 'FINDES IKKE'} employees=${sum[0].n} checksum=${(sum[0].s ?? '-').slice(0, 12)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
