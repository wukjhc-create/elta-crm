/**
 * PRODUCTION read-only: hvilke kundeopgaver rammer besigtigelses-rykkeren i offer-reminders-cronen (titel ILIKE
 * '%esigtigelse%', pending, ældre end 3 dage), og hvor mange har allerede fået kundemailen? Kun antal pr. type.
 *   npx tsx scripts/prod-besigtigelse-reminders.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-besigtigelse-reminders', async (run) => {
  const rows = await run(`
    SELECT CASE
             WHEN t.title ILIKE 'PORTAL:%' THEN 'kundens egen anmodning (PORTAL:)'
             WHEN t.auto_rule = 'offer_conversion_startup' OR t.title ILIKE 'Planlæg besigtigelse%' THEN 'intern opstartsopgave (tilbud→sag)'
             WHEN t.title ILIKE 'Besigtigelse%' THEN 'besigtigelse (booket)'
             ELSE 'andet med besigtigelse i titlen'
           END AS type,
           count(*)::int AS kandidater,
           count(*) FILTER (WHERE t.description LIKE '%[Påmindelse om bekræftelse sendt%' OR t.description LIKE '%"reminder_sent"%')::int AS allerede_mailet,
           count(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < now())::int AS dato_passeret,
           count(*) FILTER (WHERE t.due_date IS NULL)::int AS uden_dato,
           count(*) FILTER (WHERE c.email IS NOT NULL AND c.email NOT LIKE '%.local')::int AS kunde_har_email
      FROM customer_tasks t LEFT JOIN customers c ON c.id = t.customer_id
     WHERE t.title ILIKE '%esigtigelse%' AND t.status = 'pending' AND t.created_at < now() - interval '3 days'
     GROUP BY 1 ORDER BY 2 DESC`)
  for (const r of rows) console.log(`${String(r.type).padEnd(38)} kandidater=${r.kandidater} allerede_mailet=${r.allerede_mailet} dato_passeret=${r.dato_passeret} uden_dato=${r.uden_dato} kunde_har_email=${r.kunde_har_email}`)
  const [all] = await run(`SELECT count(*)::int n FROM customer_tasks WHERE description LIKE '%[Påmindelse om bekræftelse sendt%'`)
  console.log(`opgaver med rykker-markering i alt (alle statusser): ${all.n}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
