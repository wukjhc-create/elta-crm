/** PRODUCTION read-only (kommunikations-review): har besigtigelses-rykkeren overskrevet opgavebeskrivelser? Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-besigtigelse-reminder', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'besigtigelse_opgaver', (SELECT count(*)::int FROM customer_tasks WHERE title ILIKE '%esigtigelse%'),
    'pending_over_3d', (SELECT count(*)::int FROM customer_tasks WHERE title ILIKE '%esigtigelse%' AND status = 'pending' AND created_at < now() - interval '3 days'),
    'beskrivelse_overskrevet', (SELECT count(*)::int FROM customer_tasks WHERE description LIKE '{"reminder_sent"%'),
    'seneste_overskrevet', (SELECT max(updated_at)::date::text FROM customer_tasks WHERE description LIKE '{"reminder_sent"%')
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
