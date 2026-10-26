/**
 * SEC-B7 regressionstest (Henrik 2026-10-24): RLS-generatoren må ikke stille kunne genskabe de brede skrive-policies for
 * customer_tasks/roof_drawings, som 00235 erstattede. Ingen DB, ingen filer skrives.
 *   npx tsx scripts/rls/superseded-guard-test.ts
 */
import * as M from './write-matrix'
import { buildMigration } from './build-migration'
import { checkSupersededGuard, WAVES } from './matrix-check'

let bad = 0
const t = (label: string, ok: boolean, note = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
const waves = M as unknown as Record<string, M.TableWritePolicy[]>
// Tabeller hvis skrive-policies ejes af dedikerede migrationer (00235: SEC-B7 · 00239: PERM-1 fase 4)
const EXPECTED: Record<string, string> = { customer_tasks: '00235', roof_drawings: '00235', customers: '00239', service_cases: '00239' }
const entries = WAVES.flatMap(({ wave }) => waves[wave].filter((p) => p.table in EXPECTED).map((p) => ({ wave, p })))

t('alle dedikerede tabeller er markeret supersededBy', entries.length === Object.keys(EXPECTED).length && entries.every(({ p }) => p.supersededBy?.migration === EXPECTED[p.table]),
  entries.map(({ p }) => `${p.table}:${p.supersededBy?.migration}`).join(', '))

// 1. en ny migration (≥ den dedikerede) må ikke kunne genereres for en wave med tabellerne
for (const { wave, p } of entries) {
  for (const nr of [p.supersededBy!.migration, String(Number(p.supersededBy!.migration) + 1).padStart(5, '0'), '00300']) {
    let msg = ''
    try { buildMigration(nr, wave) } catch (e) { msg = e instanceof Error ? e.message : String(e) }
    t(`build-migration ${nr} ${wave} afvises (${p.table})`, /vedligeholdes af migration/.test(msg), msg.slice(0, 90))
  }
}

// 2. historisk 00173 kan stadig genskabes (CI-sammenligning) — uden at noget skrives
let hist = ''
try { hist = buildMigration('00173', 'WAVE3A').sql } catch (e) { hist = `FEJL ${e}` }
t('historisk 00173 genereres stadig (kun til sammenligning)', hist.includes('customer_tasks') && !hist.startsWith('FEJL'))

// 3. mutationstest: fjernes markeringen, skal regression-checket fejle
t('historisk 00170 (WAVE1) genereres stadig', (() => { try { return buildMigration('00170', 'WAVE1').sql.includes('customers') } catch { return false } })())
t('regression-check grøn med markering', checkSupersededGuard().length === 0)
const saved = entries.map(({ p }) => p.supersededBy)
for (const { p } of entries) delete p.supersededBy
const mutated = checkSupersededGuard()
entries.forEach(({ p }, i) => { p.supersededBy = saved[i] })
t('uden markering FEJLER regression-checket', mutated.length >= entries.length, mutated.map((f) => f.slice(0, 70)).join(' | '))
t('markering genskabt efter mutation', checkSupersededGuard().length === 0)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ generator-værn for dedikerede migrationer (00235, 00239) ok')
process.exitCode = bad ? 1 : 0
