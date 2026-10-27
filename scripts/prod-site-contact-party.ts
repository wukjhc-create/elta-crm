/** PRODUCTION read-only (00241-risiko R1): sager hvis site_contact tilhører en kunde der IKKE er part (6 FK) på sagen. Kun tal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-site-contact-party', async (run) => {
  console.log(JSON.stringify((await run(`SELECT count(*)::int with_site_contact, count(*) FILTER (WHERE NOT (cc.customer_id = ANY (ARRAY[s.customer_id, s.site_customer_id, s.payer_customer_id, s.orderer_customer_id, s.end_customer_id, s.purchased_from_customer_id]) IS TRUE))::int not_party FROM public.service_cases s JOIN public.customer_contacts cc ON cc.id = s.site_contact_id`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
