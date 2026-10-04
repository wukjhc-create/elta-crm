/** PRODUCTION read-only (montør-review): timeregistreringer med kost, som en montør kan se men ikke ejer (kollegers kost). Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-time-logs-colleague', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'kollega_logs_synlige_for_montoer', (SELECT count(*)::int FROM time_logs t JOIN work_orders w ON w.id = t.work_order_id
      JOIN employees e ON e.id = w.assigned_employee_id JOIN profiles p ON p.id = e.profile_id
      WHERE p.role = 'montør' AND e.active AND t.employee_id IS DISTINCT FROM e.id AND coalesce(t.cost_amount, 0) > 0)
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
