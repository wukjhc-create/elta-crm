/**
 * PRODUCTION read-only: kunder med pladsholder-e-mail (@elta-crm.local) og auto-email-tag — antal, aktive, med
 * tilbud/sag/faktura (må ikke deaktiveres blindt). Kun antal.
 *   npx tsx scripts/prod-placeholder-customers.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-placeholder-customers', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'pladsholder_email', (SELECT count(*)::int FROM customers WHERE email ILIKE '%@elta-crm.local'),
    'auto_email_tag', (SELECT count(*)::int FROM customers WHERE 'auto-email' = ANY(tags)),
    'auto_aktive', (SELECT count(*)::int FROM customers WHERE 'auto-email' = ANY(tags) AND is_active),
    'auto_med_tilbud_sag_faktura', (SELECT count(*)::int FROM customers c WHERE 'auto-email' = ANY(c.tags) AND (
        EXISTS (SELECT 1 FROM offers o WHERE o.customer_id = c.id) OR EXISTS (SELECT 1 FROM service_cases s WHERE s.customer_id = c.id)
        OR EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id))),
    'kunder_i_alt', (SELECT count(*)::int FROM customers)
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
