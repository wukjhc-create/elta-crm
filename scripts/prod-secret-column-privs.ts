/**
 * PRODUCTION read-only: kan 'authenticated' læse hemmelige kolonner (tokens, krypterede nøgler)? Kun ja/nej pr. kolonne.
 *   npx tsx scripts/prod-secret-column-privs.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-secret-column-privs', async (run, masked) => {
  const rows = await run(`SELECT table_name tbl, column_name col,
      has_column_privilege('authenticated', format('public.%I', table_name), column_name, 'SELECT') auth_select,
      has_column_privilege('anon', format('public.%I', table_name), column_name, 'SELECT') anon_select
    FROM information_schema.columns
    WHERE table_schema = 'public' AND (
      (table_name IN ('portal_access_tokens', 'partner_access_tokens', 'document_confirmations') AND column_name ILIKE '%token%')
      OR (table_name IN ('supplier_credentials', 'integrations', 'integration_endpoints', 'integration_webhooks', 'accounting_integration_settings')
          AND (column_name ILIKE '%secret%' OR column_name ILIKE '%password%' OR column_name ILIKE '%token%' OR column_name ILIKE '%key%' OR column_name ILIKE '%encrypted%' OR column_name ILIKE '%credential%')))
    ORDER BY 1, 2`)
  console.log(`--- hemmelige kolonner @ prod:${masked} ---`)
  for (const r of rows as Array<{ tbl: string; col: string; auth_select: boolean; anon_select: boolean }>) {
    console.log(`${r.auth_select ? 'LÆSBAR ' : 'lukket  '} ${r.tbl}.${r.col}${r.anon_select ? '  (OGSÅ anon!)' : ''}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
