/**
 * PRODUCTION read-only: findes der kunder/kontakter med FormSubmit-afsenderen som e-mail (fejl-oprettet fra en
 * webhenvendelse)? Og er mails koblet til dem? Kun antal.
 *   npx tsx scripts/prod-formsubmit-customers.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-formsubmit-customers', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'kunder', (SELECT count(*)::int FROM customers WHERE email ILIKE '%formsubmit.co%'),
    'kontakter', (SELECT count(*)::int FROM customer_contacts WHERE email ILIKE '%formsubmit.co%'),
    'mails_koblet_til_dem', (SELECT count(*)::int FROM incoming_emails e JOIN customers c ON c.id = e.customer_id WHERE c.email ILIKE '%formsubmit.co%'),
    'leads', (SELECT count(*)::int FROM leads WHERE email ILIKE '%formsubmit.co%')
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
