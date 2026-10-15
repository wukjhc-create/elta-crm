/**
 * PRODUCTION read-only pre/post for 00226 (offers.customer_id → RESTRICT): FK-regel, rækketal og checksum på offers
 * (beviser at ingen data ændres). Kun aggregater.   npx tsx scripts/prod-check-00226.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-check-00226', async (run, masked) => {
  const fk = (await run(`SELECT CASE confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT' WHEN 'n' THEN 'SET NULL' WHEN 'a' THEN 'NO ACTION' END AS r, convalidated AS v
    FROM pg_constraint WHERE conname = 'offers_customer_id_fkey' AND conrelid = 'public.offers'::regclass`)) as Array<{ r: string; v: boolean }>
  const n = (await run(`SELECT count(*)::int offers, count(DISTINCT customer_id)::int kunder,
      md5(string_agg(id::text || ':' || coalesce(customer_id::text,'-') || ':' || status || ':' || coalesce(final_amount::text,'-'), ',' ORDER BY id)) AS sum
    FROM public.offers`)) as Array<{ offers: number; kunder: number; sum: string }>
  const sig = (await run(`SELECT count(*)::int n FROM public.offer_signatures`)) as Array<{ n: number }>
  console.log(`prod:${masked} offers_customer_id_fkey=${fk.map((f) => `${f.r}${f.v ? '' : ' (ikke valideret)'}`).join(',') || 'MANGLER'}`)
  console.log(`offers=${n[0].offers} kunder_med_tilbud=${n[0].kunder} checksum=${n[0].sum?.slice(0, 12)} signaturer=${sig[0].n}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
