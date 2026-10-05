/** PRODUCTION read-only (montør-review): kan authenticated læse time_logs' kost-/salgskolonner, og hvad siger SELECT-policyen? Kun metadata + antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-time-logs-exposure', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'auth_cost_amount', has_column_privilege('authenticated', 'public.time_logs', 'cost_amount', 'SELECT'),
    'auth_cost_rate', has_column_privilege('authenticated', 'public.time_logs', 'cost_rate_snapshot', 'SELECT'),
    'auth_update_invoice_line', has_column_privilege('authenticated', 'public.time_logs', 'invoice_line_id', 'UPDATE'),
    'select_policies', (SELECT json_agg(json_build_object('p', policyname, 'roles', roles, 'qual', qual)) FROM pg_policies WHERE tablename = 'time_logs' AND cmd IN ('SELECT','ALL')),
    'update_policies', (SELECT json_agg(json_build_object('p', policyname, 'qual', qual, 'check', with_check)) FROM pg_policies WHERE tablename = 'time_logs' AND cmd = 'UPDATE'),
    'triggers', (SELECT json_agg(tgname) FROM pg_trigger WHERE tgrelid = 'public.time_logs'::regclass AND NOT tgisinternal),
    'logs', (SELECT count(*)::int FROM time_logs),
    'logs_med_kost', (SELECT count(*)::int FROM time_logs WHERE coalesce(cost_amount, 0) > 0),
    'montoerer', (SELECT count(*)::int FROM profiles WHERE role = 'montor')
  ) r`))[0].r, null, 1))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
