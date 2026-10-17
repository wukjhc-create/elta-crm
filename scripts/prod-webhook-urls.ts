/**
 * PRODUCTION read-only (SEC2-2, security-review 2026-10-17): udgående webhooks — antal aktive og URL-skema/værtstype
 * (ingen URL'er, headers eller nøgler udskrives). Kun aggregater.
 *   npx tsx scripts/prod-webhook-urls.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-webhook-urls', async (run, masked) => {
  const rows = (await run(`SELECT w.is_active AS webhook_active, i.is_active AS integration_active,
      split_part(w.url, ':', 1) AS scheme,
      (split_part(split_part(w.url, '://', 2), '/', 1) ~ '^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.)') AS private_host,
      count(*)::int n
    FROM public.integration_webhooks w LEFT JOIN public.integrations i ON i.id = w.integration_id
    GROUP BY 1,2,3,4 ORDER BY 1,2,3,4`).catch((e) => [{ error: maskDbError(e) }])) as Array<Record<string, unknown>>
  console.log(`prod:${masked} webhooks=${JSON.stringify(rows)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
