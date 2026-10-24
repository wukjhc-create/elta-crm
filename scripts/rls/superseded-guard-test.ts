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
const entries = WAVES.flatMap(({ wave }) => waves[wave].filter((p) => p.table === 'customer_tasks' || p.table === 'roof_drawings').map((p) => ({ wave, p })))

t('begge tabeller er markeret supersededBy 00235', entries.length === 2 && entries.every(({ p }) => p.supersededBy?.migration === '00235'), entries.map(({ p }) => `${p.table}:${p.supersededBy?.migration}`).join(', '))

// 1. ny migration (00236/00300) må ikke kunne genereres for en wave med tabellerne
for (const nr of ['00235', '00236', '00300']) {
  for (const w of [...new Set(entries.map((e) => e.wave))]) {
    let msg = ''
    try { buildMigration(nr, w) } catch (e) { msg = e instanceof Error ? e.message : String(e) }
    t(`build-migration ${nr} ${w} afvises`, /vedligeholdes af migration 00235/.test(msg), msg.slice(0, 90))
  }
}

// 2. historisk 00173 kan stadig genskabes (CI-sammenligning) — uden at noget skrives
let hist = ''
try { hist = buildMigration('00173', 'WAVE3A').sql } catch (e) { hist = `FEJL ${e}` }
t('historisk 00173 genereres stadig (kun til sammenligning)', hist.includes('customer_tasks') && !hist.startsWith('FEJL'))

// 3. mutationstest: fjernes markeringen, skal regression-checket fejle
t('regression-check grøn med markering', checkSupersededGuard().length === 0)
const saved = entries.map(({ p }) => p.supersededBy)
for (const { p } of entries) delete p.supersededBy
const mutated = checkSupersededGuard()
entries.forEach(({ p }, i) => { p.supersededBy = saved[i] })
t('uden markering FEJLER regression-checket', mutated.length >= 2, mutated.map((f) => f.slice(0, 70)).join(' | '))
t('markering genskabt efter mutation', checkSupersededGuard().length === 0)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ generator-værn for 00235 ok')
process.exitCode = bad ? 1 : 0
