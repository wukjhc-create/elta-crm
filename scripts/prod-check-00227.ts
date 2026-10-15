/**
 * PRODUCTION read-only pre/post for 00227: kolonner på work_orders + checksum (beviser ingen dataændring).
 *   npx tsx scripts/prod-check-00227.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-check-00227', async (run, masked) => {
  const cols = (await run(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='work_orders'
    AND column_name IN ('start_time','estimated_hours') ORDER BY 1`)) as Array<{ column_name: string; data_type: string }>
  const sum = (await run(`SELECT count(*)::int n, md5(string_agg(id::text || ':' || status || ':' || coalesce(scheduled_date::text,'-') || ':' || coalesce(assigned_employee_id::text,'-'), ',' ORDER BY id)) s FROM public.work_orders`)) as Array<{ n: number; s: string | null }>
  console.log(`prod:${masked} kolonner=[${cols.map((c) => `${c.column_name}:${c.data_type}`).join(', ') || 'ingen'}] work_orders=${sum[0].n} checksum=${(sum[0].s ?? '-').slice(0, 12)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
