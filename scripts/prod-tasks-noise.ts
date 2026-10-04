/**
 * PRODUCTION read-only: opgaver (customer_tasks) — åbne, auto-genererede, alder, og hvor mange auto-opgaver stammer
 * fra "ubesvarede mails". Kun antal.
 *   npx tsx scripts/prod-tasks-noise.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-tasks-noise', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'i_alt', (SELECT count(*)::int FROM customer_tasks),
    'status', (SELECT json_object_agg(coalesce(status, '?'), n) FROM (SELECT status, count(*)::int n FROM customer_tasks GROUP BY 1) x),
    'aabne_auto', (SELECT count(*)::int FROM customer_tasks WHERE status <> 'done' AND auto_generated),
    'aabne_manuelle', (SELECT count(*)::int FROM customer_tasks WHERE status <> 'done' AND NOT coalesce(auto_generated, false)),
    'aabne_forfaldne', (SELECT count(*)::int FROM customer_tasks WHERE status <> 'done' AND due_date < now()),
    'auto_titler', (SELECT json_object_agg(t, n) FROM (SELECT left(regexp_replace(title, '[0-9]+', '#', 'g'), 40) t, count(*)::int n FROM customer_tasks
        WHERE auto_generated GROUP BY 1 ORDER BY 2 DESC LIMIT 6) x),
    'oprettet_30d', (SELECT count(*)::int FROM customer_tasks WHERE created_at > now() - interval '30 days'),
    'lukket_30d', (SELECT count(*)::int FROM customer_tasks WHERE status = 'done' AND updated_at > now() - interval '30 days')
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
