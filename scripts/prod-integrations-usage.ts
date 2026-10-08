/**
 * PRODUCTION read-only: bruges integrations-webhooks? Antal integrationer (aktive), external_references og webhook-logs
 * seneste 90 dage pr. udfald. Kun antal.   npx tsx scripts/prod-integrations-usage.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-integrations-usage', async (run, masked) => {
  const rows = await run(`SELECT
      (SELECT count(*)::int FROM integrations) integrations,
      (SELECT count(*)::int FROM integrations WHERE is_active) active,
      (SELECT count(*)::int FROM external_references) external_refs,
      (SELECT count(*)::int FROM integration_logs WHERE created_at > now() - interval '90 days') logs_90d`)
  console.log(`--- integrationer @ prod:${masked} ---`)
  console.table(rows)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
