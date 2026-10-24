/**
 * P-009 CI-check (ingen DB): RLS-skrivematrixen skal daekke ALLE appens bruger-session-skrivestier, og de
 * genererede migrationer maa ikke drive fra matrixen.
 *   npm run check:rls-matrix
 *
 * FEJL hvis:
 *   1. en rolle skriver (insert/update/delete) til en matrix-tabel via app-kode, men matrixen ikke tillader den
 *      (= lockdown ville bryde et legitimt flow). Betingede slet-roller (fx forslag) taeller som tilladt.
 *   2. en genereret migrationsfil ikke er identisk med hvad matrixen genererer i dag.
 *   3. en tabel som en anon-cron (P-003) naar, mister sine anon-grants (cron-adfaerd ville aendres).
 *   4. SEC-B7: en tabel med dedikeret skrive-migration (00235) mangler sin supersededBy-markering, generatoren ville kunne
 *      genskabe de brede policies i en ny migration, eller en GENERERET migration efter 00235 rører tabellens policies.
 * ADVARSEL (ikke fejl): skrivestier hvis klient/gate ikke kunne oploeses statisk (vurderet manuelt i matrixens `why`).
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { scanWriteSites, derivedRoles, anonCronTables } from '../rls-write-sites'
import * as M from './write-matrix'
import { buildMigration } from './build-migration'

export const WAVES: Array<{ nr: string; wave: string }> = [{ nr: '00170', wave: 'WAVE1' }, { nr: '00171', wave: 'WAVE2A' }, { nr: '00172', wave: 'WAVE2B' }, { nr: '00173', wave: 'WAVE3A' }, { nr: '00174', wave: 'WAVE3B' }, { nr: '00178', wave: 'WAVE4' }, { nr: '00181', wave: 'WAVE5' }]

export function checkMatrix(): { failures: string[]; warnings: string[] } {
  const failures: string[] = []
  const warnings: string[] = []
  const all = WAVES.flatMap(({ wave }) => (M as unknown as Record<string, M.TableWritePolicy[]>)[wave])
  const sites = scanWriteSites(undefined, all.map((p) => p.table))
  for (const p of all) {
    for (const op of ['insert', 'update', 'delete'] as const) {
      const d = derivedRoles(sites, p.table, op)
      const cond = op === 'delete' ? p.deleteConditional : op === 'insert' ? p.insertConditional : p.updateConditional
      const allowed = new Set<string>([...p[op], ...(cond?.roles ?? [])])
      for (const r of d.roles ?? []) if (!allowed.has(r)) failures.push(`${p.table}.${op}: appen skriver som '${r}', men matrixen tillader kun ${[...allowed].join(',')}`)
      if (d.unresolved.length) warnings.push(`${p.table}.${op}: ${d.unresolved.length} statisk uafklarede stier (manuelt vurderet)`)
    }
  }
  // Tabeller som anon-crons (P-003) naar: anon-grants SKAL bevares (ellers aendres cron-adfaerd).
  const anonCron = anonCronTables()
  for (const p of all) if (anonCron.has(p.table) && !p.keepAnonGrants) failures.push(`${p.table}: laeses/skrives af anon-cron (${anonCron.get(p.table)!.slice(0, 2).join(', ')}) — saet keepAnonGrants`)
  for (const { nr, wave } of WAVES) {
    const { file, sql } = buildMigration(nr, wave)
    if (!existsSync(file)) failures.push(`${nr}: migrationsfil mangler (${file})`)
    else if (readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== sql) failures.push(`${nr}: migrationsfilen afviger fra matrixen — kør npx tsx scripts/rls/build-migration.ts ${nr} ${wave}`)
  }
  failures.push(...checkSupersededGuard())
  return { failures, warnings }
}

/** SEC-B7 (Henrik 2026-10-24): disse tabellers skrive-policies ejes af dedikerede migrationer — generatoren må ikke genskabe dem. */
export const DEDICATED_WRITE_POLICIES: Record<string, { migration: string; mustContain: string[] }> = {
  customer_tasks: { migration: '00235', mustContain: ['CREATE POLICY customer_tasks_insert_role', 'created_by = auth.uid()', 'trg_customer_tasks_write_guard'] },
  roof_drawings: { migration: '00235', mustContain: ['CREATE POLICY roof_drawings_insert_role', 'case_belongs_to_customer', 'trg_roof_drawings_update_guard'] },
}

export function checkSupersededGuard(): string[] {
  const failures: string[] = []
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const files = readdirSync(dir).filter((f) => /^\d{5}_.*\.sql$/.test(f))
  for (const [table, req] of Object.entries(DEDICATED_WRITE_POLICIES)) {
    const waves = WAVES.filter(({ wave }) => (M as unknown as Record<string, M.TableWritePolicy[]>)[wave].some((p) => p.table === table))
    for (const { wave } of waves) {
      const entry = (M as unknown as Record<string, M.TableWritePolicy[]>)[wave].find((p) => p.table === table)!
      if (entry.supersededBy?.migration !== req.migration) failures.push(`${table}: matrix-posten (${wave}) mangler supersededBy=${req.migration} — generatoren kunne genskabe de brede skrive-policies`)
      // regression: et forsøg på at generere tabellens policies i en NY migration skal afvises
      const next = String(Number(req.migration) + 1).padStart(5, '0')
      let refused = false
      try { buildMigration(next, wave) } catch { refused = true }
      if (!refused) failures.push(`${table}: build-migration ${next} ${wave} blev IKKE afvist — de brede policies kunne genskabes`)
    }
    const dedicated = files.find((f) => f.startsWith(`${req.migration}_`))
    if (!dedicated) failures.push(`${table}: dedikeret migration ${req.migration} mangler`)
    else {
      const sql = readFileSync(join(dir, dedicated), 'utf8')
      for (const needle of req.mustContain) if (!sql.includes(needle)) failures.push(`${table}: ${dedicated} indeholder ikke "${needle}"`)
    }
    // ingen GENERERET migration efter den dedikerede må røre tabellens skrive-policies
    for (const f of files.filter((x) => Number(x.slice(0, 5)) > Number(req.migration))) {
      const sql = readFileSync(join(dir, f), 'utf8')
      if (sql.includes('GENERERET af scripts/rls/build-migration.ts') && new RegExp(`POLICY\\s+${table}_(insert|update|delete)_role`).test(sql)) {
        failures.push(`${f}: genereret migration rører ${table}s skrive-policies (ejes af ${req.migration})`)
      }
    }
  }
  return failures
}

if (require.main === module) {
  const { failures, warnings } = checkMatrix()
  for (const w of warnings) console.log(`  ⚠ ${w}`)
  for (const f of failures) console.log(`  ❌ ${f}`)
  console.log(failures.length ? `\n❌ RLS-MATRIX: ${failures.length} fejl` : '\n✅ RLS-MATRIX: alle app-skrivestier dækket, migrationer i sync')
  process.exit(failures.length ? 1 : 0)
}
