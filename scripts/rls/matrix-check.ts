/**
 * P-009 CI-check (ingen DB): RLS-skrivematrixen skal daekke ALLE appens bruger-session-skrivestier, og de
 * genererede migrationer maa ikke drive fra matrixen.
 *   npm run check:rls-matrix
 *
 * FEJL hvis:
 *   1. en rolle skriver (insert/update/delete) til en matrix-tabel via app-kode, men matrixen ikke tillader den
 *      (= lockdown ville bryde et legitimt flow). Betingede slet-roller (fx forslag) taeller som tilladt.
 *   2. en genereret migrationsfil ikke er identisk med hvad matrixen genererer i dag.
 * ADVARSEL (ikke fejl): skrivestier hvis klient/gate ikke kunne oploeses statisk (vurderet manuelt i matrixens `why`).
 */
import { readFileSync, existsSync } from 'fs'
import { scanWriteSites, derivedRoles } from '../rls-write-sites'
import * as M from './write-matrix'
import { buildMigration } from './build-migration'

export const WAVES: Array<{ nr: string; wave: string }> = [{ nr: '00170', wave: 'WAVE1' }]

export function checkMatrix(): { failures: string[]; warnings: string[] } {
  const failures: string[] = []
  const warnings: string[] = []
  const all = WAVES.flatMap(({ wave }) => (M as unknown as Record<string, M.TableWritePolicy[]>)[wave])
  const sites = scanWriteSites(undefined, all.map((p) => p.table))
  for (const p of all) {
    for (const op of ['insert', 'update', 'delete'] as const) {
      const d = derivedRoles(sites, p.table, op)
      const allowed = new Set<string>([...p[op], ...(op === 'delete' ? p.deleteConditional?.roles ?? [] : [])])
      for (const r of d.roles ?? []) if (!allowed.has(r)) failures.push(`${p.table}.${op}: appen skriver som '${r}', men matrixen tillader kun ${[...allowed].join(',')}`)
      if (d.unresolved.length) warnings.push(`${p.table}.${op}: ${d.unresolved.length} statisk uafklarede stier (manuelt vurderet)`)
    }
  }
  for (const { nr, wave } of WAVES) {
    const { file, sql } = buildMigration(nr, wave)
    if (!existsSync(file)) failures.push(`${nr}: migrationsfil mangler (${file})`)
    else if (readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== sql) failures.push(`${nr}: migrationsfilen afviger fra matrixen — kør npx tsx scripts/rls/build-migration.ts ${nr} ${wave}`)
  }
  return { failures, warnings }
}

if (require.main === module) {
  const { failures, warnings } = checkMatrix()
  for (const w of warnings) console.log(`  ⚠ ${w}`)
  for (const f of failures) console.log(`  ❌ ${f}`)
  console.log(failures.length ? `\n❌ RLS-MATRIX: ${failures.length} fejl` : '\n✅ RLS-MATRIX: alle app-skrivestier dækket, migrationer i sync')
  process.exit(failures.length ? 1 : 0)
}
