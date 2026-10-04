/**
 * PRODUCTION read-only: mulige kundedubletter (N56) — samme e-mail, samme telefon eller samme navn. Kun antal (ingen
 * persondata udskrives).
 *   npx tsx scripts/prod-customer-duplicates.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-customer-duplicates', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'kunder', (SELECT count(*)::int FROM customers WHERE is_active),
    'email_grupper', (SELECT count(*)::int FROM (SELECT lower(trim(email)) e FROM customers WHERE is_active AND coalesce(trim(email), '') <> '' GROUP BY 1 HAVING count(*) > 1) x),
    'email_kunder', (SELECT coalesce(sum(n), 0)::int FROM (SELECT count(*) n FROM customers WHERE is_active AND coalesce(trim(email), '') <> '' GROUP BY lower(trim(email)) HAVING count(*) > 1) x),
    'telefon_grupper', (SELECT count(*)::int FROM (SELECT regexp_replace(phone, '\\D', '', 'g') p FROM customers WHERE is_active AND length(regexp_replace(coalesce(phone, ''), '\\D', '', 'g')) >= 8 GROUP BY 1 HAVING count(*) > 1) x),
    'navn_grupper', (SELECT count(*)::int FROM (SELECT lower(trim(company_name)) n FROM customers WHERE is_active AND coalesce(trim(company_name), '') <> '' GROUP BY 1 HAVING count(*) > 1) x)
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
