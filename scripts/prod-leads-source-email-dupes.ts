/**
 * PRODUCTION read-only: dubletter af leads pr. custom_fields.source_email_id (før unikt indeks) + leads pr. status. Ingen personværdier.
 *   npx tsx scripts/prod-leads-source-email-dupes.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-leads-source-email-dupes', async (run, masked) => {
  const rows = await run(`SELECT
      (SELECT count(*) FROM leads) total,
      (SELECT count(*) FROM leads WHERE custom_fields->>'source_email_id' IS NOT NULL) with_source,
      (SELECT count(*) FROM (SELECT custom_fields->>'source_email_id' k FROM leads WHERE custom_fields->>'source_email_id' IS NOT NULL
         GROUP BY 1 HAVING count(*) > 1) d) dup_groups,
      (SELECT string_agg(status || '=' || n, ', ') FROM (SELECT status, count(*) n FROM leads GROUP BY 1 ORDER BY 1) s) by_status`)
  console.log(`--- leads @ prod:${masked} ---`)
  console.log(JSON.stringify(rows[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
