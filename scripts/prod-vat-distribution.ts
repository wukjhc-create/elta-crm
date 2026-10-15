/**
 * PRODUCTION read-only: momssatser i brug (PR-10, Henrik 2026-10-15) — tilbud (tax_percentage), fakturaer (tax/total),
 * sager koblet til tilbud med ≠ 25 %. Kun tal.   npx tsx scripts/prod-vat-distribution.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-vat-distribution', async (run, masked) => {
  const o = (await run(`SELECT coalesce(tax_percentage::text,'NULL') sats, count(*)::int n FROM public.offers GROUP BY 1 ORDER BY 2 DESC`)) as Array<{ sats: string; n: number }>
  const i = (await run(`SELECT CASE WHEN total_amount = 0 THEN 'total=0' ELSE round(abs(tax_amount / total_amount) * 100)::text || ' %' END sats, count(*)::int n
    FROM public.invoices GROUP BY 1 ORDER BY 2 DESC`)) as Array<{ sats: string; n: number }>
  const c = (await run(`SELECT count(*)::int n FROM public.service_cases sc JOIN public.offers o ON o.id = sc.source_offer_id WHERE coalesce(o.tax_percentage, 25) <> 25`)) as Array<{ n: number }>
  console.log(`prod:${masked} tilbud ${JSON.stringify(o)} · fakturaer ${JSON.stringify(i)} · sager fra tilbud ≠25%: ${c[0].n}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
