/**
 * PRODUCTION read-only (2026-11-01): fordeling af service_cases.type og hvilke sager der har en seedet aflevering-tjekliste
 * med solcelle-punkter — grundlag for tjekliste pr. sagstype. Kun antal, ingen personværdier.
 *   npx tsx scripts/prod-case-type-checklist.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-case-type-checklist', async (run, masked) => {
  console.log(`prod:${masked}`)
  const rows = await run(`
    select coalesce(type, '(null)') as type, status,
      count(*)::int as n,
      count(*) filter (where jsonb_array_length(coalesce(checklist, '[]'::jsonb)) > 0)::int as with_checklist,
      count(*) filter (where checklist @> '[{"key":"inverter_photo"}]')::int as solar_items,
      count(*) filter (where source_offer_id is not null)::int as from_offer
    from service_cases group by 1, 2 order by 1, 2`)
  console.table(rows)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
