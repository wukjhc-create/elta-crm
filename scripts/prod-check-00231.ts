/**
 * PRODUCTION read-only pre/post for 00231: momsmode-kolonner, fordeling, og beløbs-checksum på tilbud/fakturaer
 * (beviser at ingen beløb ændres). Kun aggregater.   npx tsx scripts/prod-check-00231.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-check-00231', async (run, masked) => {
  const cols = (await run(`SELECT table_name || '.' || column_name c FROM information_schema.columns WHERE table_schema='public'
    AND ((table_name='customers' AND column_name IN ('vat_mode','vat_number')) OR (table_name='offers' AND column_name='vat_mode') OR (table_name='invoices' AND column_name IN ('vat_mode','vat_rate'))) ORDER BY 1`)) as Array<{ c: string }>
  const has = (c: string) => cols.some((x) => x.c === c)
  const dist = async (t: string) => has(`${t}.vat_mode`) ? JSON.stringify(await run(`SELECT coalesce(vat_mode,'NULL') m, count(*)::int n FROM public.${t} GROUP BY 1 ORDER BY 1`)) : '-'
  const sums = (await run(`SELECT
      (SELECT md5(string_agg(id::text || ':' || coalesce(final_amount::text,'-') || ':' || coalesce(tax_amount::text,'-'), ',' ORDER BY id)) FROM public.offers) o,
      (SELECT md5(string_agg(id::text || ':' || coalesce(total_amount::text,'-') || ':' || coalesce(tax_amount::text,'-') || ':' || coalesce(final_amount::text,'-'), ',' ORDER BY id)) FROM public.invoices) i`)) as Array<{ o: string | null; i: string | null }>
  console.log(`prod:${masked} kolonner=[${cols.map((c) => c.c).join(', ') || 'ingen'}] kunder=${await dist('customers')} tilbud=${await dist('offers')} fakturaer=${await dist('invoices')} · checksum tilbud=${(sums[0].o ?? '-').slice(0, 10)} fakturaer=${(sums[0].i ?? '-').slice(0, 10)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
