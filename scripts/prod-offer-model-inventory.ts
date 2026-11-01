/**
 * PRODUCTION read-only (2026-11-01): findes et struktureret felt på tilbud der kan bære den tilsigtede sagstype
 * (tilbud→sag)? Kun skema, CHECK-constraints og antal — ingen personværdier eller fritekst.
 *   npx tsx scripts/prod-offer-model-inventory.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-offer-model-inventory', async (run) => {
  console.log('offers-kolonner:')
  console.log((await run(`select column_name || ':' || data_type as c from information_schema.columns where table_schema='public' and table_name='offers' order by ordinal_position`)).map((r) => r.c).join(', '))
  console.log('\nkolonner andre steder der refererer tilbud/pakker/skabeloner:')
  console.table(await run(`select table_name, column_name, data_type from information_schema.columns where table_schema='public'
    and (column_name in ('offer_id','package_id','template_id','job_type','offer_type','case_type','kind','category')) and table_name ilike any (array['offer%','%package%','%template%','service_cases'])
    order by 1, 2`))
  console.log('\nCHECK-constraints på offers/offer_packages/service_cases:')
  console.table(await run(`select conrelid::regclass::text as t, conname, pg_get_constraintdef(oid) as def from pg_constraint
    where contype='c' and conrelid::regclass::text in ('offers','offer_packages','service_cases') order by 1, 2`))
  console.log('\nantal:')
  console.table(await run(`select (select count(*)::int from offers) offers, (select count(*)::int from offer_packages) packages,
    (select count(*)::int from service_cases where source_offer_id is not null) cases_from_offer`))
  console.table(await run(`select coalesce(job_type,'(null)') job_type, count(*)::int n from offer_packages group by 1 order by 1`))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
