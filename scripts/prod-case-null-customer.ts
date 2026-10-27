/** PRODUCTION read-only: sager uden kunde/adresse (montør-flow: dokument-upload kræver kunde, "Naviger" kræver adresse). Kun tal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-case-null-customer', async (run) => {
  console.log(JSON.stringify((await run(`SELECT count(*)::int cases, count(*) FILTER (WHERE customer_id IS NULL)::int no_customer, count(*) FILTER (WHERE coalesce(address, '') = '')::int no_address, count(*) FILTER (WHERE coalesce(address, '') = '' AND customer_id IS NULL)::int neither FROM public.service_cases WHERE status NOT IN ('closed', 'cancelled')`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
