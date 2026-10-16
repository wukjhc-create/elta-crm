/**
 * PRODUCTION read-only pre/post for 00232: billing_model-kolonner, fordeling på sager/tilbud, og checksum på sager
 * (kontraktsum/revideret/status) + fakturaer — beviser at kun billing_model ændres. Kun aggregater.
 *   npx tsx scripts/prod-check-00232.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-check-00232', async (run, masked) => {
  const cols = (await run(`SELECT table_name || '.' || column_name c FROM information_schema.columns WHERE table_schema='public'
    AND column_name='billing_model' AND table_name IN ('service_cases','offers') ORDER BY 1`)) as Array<{ c: string }>
  const has = (c: string) => cols.some((x) => x.c === c)
  const dist = async (t: string) => has(`${t}.billing_model`) ? JSON.stringify(await run(`SELECT coalesce(billing_model,'NULL') m, count(*)::int n FROM public.${t} GROUP BY 1 ORDER BY 1`)) : '-'
  const sums = (await run(`SELECT
      (SELECT md5(string_agg(id::text || ':' || coalesce(contract_sum::text,'-') || ':' || coalesce(revised_sum::text,'-') || ':' || status, ',' ORDER BY id)) FROM public.service_cases) s,
      (SELECT md5(string_agg(id::text || ':' || coalesce(final_amount::text,'-') || ':' || status, ',' ORDER BY id)) FROM public.invoices) i,
      (SELECT count(*)::int FROM public.service_cases) n`)) as Array<{ s: string | null; i: string | null; n: number }>
  console.log(`prod:${masked} kolonner=[${cols.map((c) => c.c).join(', ') || 'ingen'}] sager=${await dist('service_cases')} tilbud=${await dist('offers')} · n_sager=${sums[0].n} checksum sager=${(sums[0].s ?? '-').slice(0, 10)} fakturaer=${(sums[0].i ?? '-').slice(0, 10)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
