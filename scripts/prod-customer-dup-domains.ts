/**
 * PRODUCTION read-only: domæner for e-mail-dubletgrupper blandt kunder (N56) — kun domæne + antal, ingen lokale dele.
 *   npx tsx scripts/prod-customer-dup-domains.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-customer-dup-domains', async (run) => {
  const rows = await run(`SELECT split_part(e, '@', 2) AS domaene, count(*)::int AS grupper, sum(n)::int AS kunder,
      bool_or(e ~ '^(no-?reply|noreply|submissions?|form|forms|info)@') AS system_adresse
    FROM (SELECT lower(trim(email)) e, count(*) n FROM customers WHERE is_active AND coalesce(trim(email), '') <> '' GROUP BY 1 HAVING count(*) > 1) x
    GROUP BY 1 ORDER BY 3 DESC`)
  console.log(JSON.stringify(rows, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
