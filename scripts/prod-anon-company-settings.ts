/**
 * PRODUCTION read-only (Q10): kan anon-rollen læse company_settings (og dens hemmelige kolonner)? Kun ja/nej.
 *   npx tsx scripts/prod-anon-company-settings.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-anon-company-settings', async (run) => {
  const r = (await run(`SELECT json_build_object(
    'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.company_settings'::regclass),
    'anon_table_select', has_table_privilege('anon', 'public.company_settings', 'SELECT'),
    'anon_smtp_password', has_column_privilege('anon', 'public.company_settings', 'smtp_password', 'SELECT'),
    'anon_sms_secret', has_column_privilege('anon', 'public.company_settings', 'sms_gateway_secret', 'SELECT'),
    'auth_smtp_password', has_column_privilege('authenticated', 'public.company_settings', 'smtp_password', 'SELECT'),
    'select_policy_roles', (SELECT json_agg(json_build_object('p', policyname, 'roles', roles)) FROM pg_policies WHERE tablename = 'company_settings' AND cmd IN ('SELECT','ALL')),
    'anon_customer_tasks_select', has_table_privilege('anon', 'public.customer_tasks', 'SELECT'),
    'customer_tasks_policies', (SELECT json_agg(json_build_object('p', policyname, 'roles', roles, 'cmd', cmd)) FROM pg_policies WHERE tablename = 'customer_tasks')
  ) r`))[0].r
  console.log(JSON.stringify(r, null, 1))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
