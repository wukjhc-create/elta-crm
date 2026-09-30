/**
 * Skriver en P-009-lockdown-migration fra skrivematrixen (scripts/rls/write-matrix.ts).
 *   npx tsx scripts/rls/build-migration.ts <nr> <wave-navn>     fx: 00170 WAVE1
 * Filen er deterministisk; CI-checket (rls-matrix-check) sikrer at matrix og migration ikke driver fra hinanden.
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
import * as M from './write-matrix'

export function buildMigration(nr: string, wave: string): { file: string; sql: string } {
  const policies = (M as unknown as Record<string, M.TableWritePolicy[]>)[wave]
  if (!Array.isArray(policies)) throw new Error(`ukendt wave: ${wave}`)
  const header = `-- =====================================================================
-- ${nr} — P-009 RLS-skrivelås, ${wave} (${policies.map((p) => p.table).join(', ')})
--
-- GENERERET af scripts/rls/build-migration.ts fra scripts/rls/write-matrix.ts — ret matrixen, ikke denne fil.
--
-- Fund (P-009, S2 systemisk, prod read-only 2026-09-29): skrive-policies USING/WITH CHECK (true) -> enhver indlogget
-- kunne via REST oprette/rette/slette paa tvaers af roller (RBAC blev kun haandhaevet i server-actions).
-- Nu: praecis de roller appen skriver med via bruger-sessionen (AST-kortlagt: scripts/rls-write-sites.ts;
-- CI: npm run check:rls-matrix). Laesning (SELECT) er UAENDRET. anon mister alle tabel-grants.
-- service-role (cron, portal, sync) paavirkes ikke af RLS.
--
-- Rollback: genskab de droppede policies (navne i DROP-linjerne) som USING/WITH CHECK (true) for authenticated.
-- =====================================================================
`
  const sql = `${header}\nBEGIN;\n\n${M.generateSql(policies)}\nNOTIFY pgrst, 'reload schema';\n\nCOMMIT;\n`
  const file = join(process.cwd(), 'supabase', 'migrations', `${nr}_p009_rls_write_lockdown_${wave.toLowerCase()}.sql`)
  return { file, sql }
}

if (require.main === module) {
  const [nr, wave] = process.argv.slice(2)
  if (!/^\d{5}$/.test(nr ?? '') || !wave) { console.error('brug: build-migration.ts <nr> <WAVE>'); process.exit(2) }
  const { file, sql } = buildMigration(nr, wave)
  writeFileSync(file, sql, 'utf8')
  console.log(`skrev ${file}`)
}
