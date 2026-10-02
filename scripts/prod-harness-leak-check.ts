/** PRODUCTION read-only: findes der test-data fra harness i prod (oprettet de sidste N timer)? Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-harness-leak-check', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'offers', (SELECT count(*)::int FROM offers WHERE (title ILIKE '%[HARNESS]%' OR offer_number ILIKE 'UI-E2E%') AND created_at > now() - interval '24 hours'),
    'customers', (SELECT count(*)::int FROM customers WHERE (company_name ILIKE '%[HARNESS]%' OR customer_number ILIKE 'UI-E2E%' OR email ILIKE '%@harness.test') AND created_at > now() - interval '24 hours'),
    'service_cases', (SELECT count(*)::int FROM service_cases WHERE title ILIKE '%[HARNESS]%' AND created_at > now() - interval '24 hours'),
    'invoices', (SELECT count(*)::int FROM invoices WHERE invoice_number ILIKE 'UI-E2E%' AND created_at > now() - interval '24 hours'),
    'leads', (SELECT count(*)::int FROM leads WHERE (company_name ILIKE '%[HARNESS]%' OR email ILIKE '%@harness.test') AND created_at > now() - interval '24 hours'),
    'auth_users_harness', (SELECT count(*)::int FROM auth.users WHERE email ILIKE '%@harness.test'),
    'audit_logs_24h', (SELECT count(*)::int FROM audit_logs WHERE created_at > now() - interval '24 hours')
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
