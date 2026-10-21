/**
 * PRODUCTION read-only: views og public-funktioner der refererer en tabel (migrations-pre-check: rammer en ny RLS-politik
 * andre læsere end appens egne kald?).
 *   npx tsx scripts/prod-table-dependents.ts lead_activities
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const t = String(process.argv[2] ?? '').replace(/[^a-z0-9_]/g, '')
if (!t) { console.error('angiv tabel'); process.exit(2) }
withProdReadOnly('prod-table-dependents', async (run, masked) => {
  console.log(`--- ${t} afhængigheder @ prod:${masked} (READ ONLY) ---`)
  console.log('views:', JSON.stringify(await run(`SELECT schemaname, viewname FROM pg_views WHERE definition ILIKE '%${t}%' AND schemaname NOT IN ('pg_catalog','information_schema')`)))
  console.log('funktioner:', JSON.stringify(await run(`SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prosrc ILIKE '%${t}%'`)))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
