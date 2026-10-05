/** PRODUCTION read-only: antal brugere pr. rolle + timeregistreringer med kost pr. sag-ejer-rolle. Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-role-counts', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'roller', (SELECT json_object_agg(role, n) FROM (SELECT role, count(*)::int n FROM profiles GROUP BY role) x),
    'montoerer_med_medarbejder', (SELECT count(*)::int FROM employees e JOIN profiles p ON p.id = e.profile_id WHERE e.active AND p.role IN ('montør','montor')),
    'time_logs_med_kost', (SELECT count(*)::int FROM time_logs WHERE coalesce(cost_amount, 0) > 0)
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
