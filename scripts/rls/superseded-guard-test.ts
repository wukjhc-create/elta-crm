/**
 * SEC-B7 regressionstest (Henrik 2026-10-24): RLS-generatoren må ikke stille kunne genskabe de brede skrive-policies for
 * customer_tasks/roof_drawings, som 00235 erstattede. Ingen DB, ingen filer skrives.
 *   npx tsx scripts/rls/superseded-guard-test.ts
 */
import * as M from './write-matrix'
import { buildMigration } from './build-migration'
import { checkSupersededGuard, checkSelectReplacedGuard, WAVES } from './matrix-check'

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

// 4. læse-scope-værn (Henrik 2026-10-29 "No broad fallback policy"): ingen åben SELECT genskabes efter erstatningen
t('læse-værn grønt', checkSelectReplacedGuard().length === 0, checkSelectReplacedGuard().slice(0, 2).join(' | '))
for (const [nr, wave, table] of [['00242', 'WAVE5', 'work_orders'], ['00241', 'WAVE1', 'customer_contacts'], ['00300', 'WAVE3A', 'case_materials']]) {
  let msg = ''
  try { buildMigration(nr, wave) } catch (e) { msg = e instanceof Error ? e.message : String(e) }
  t(`build-migration ${nr} ${wave} afvises (${table}: åben SELECT)`, /læsning erstattet|vedligeholdes af migration/.test(msg), msg.slice(0, 90))
}
t('historisk 00181 (WAVE5) genereres stadig med åben SELECT', (() => { try { return buildMigration('00181', 'WAVE5').sql.includes('work_orders_select_authenticated ON public.work_orders FOR SELECT TO authenticated USING (true)') } catch { return false } })())
const savedSel = M.SELECT_REPLACED.work_orders
delete (M.SELECT_REPLACED as Record<string, unknown>).work_orders
const mutSel = checkSelectReplacedGuard()
M.SELECT_REPLACED.work_orders = savedSel
t('uden work_orders i SELECT_REPLACED FEJLER læse-værnet', mutSel.some((f) => f.startsWith('work_orders:')), mutSel.slice(0, 1).join(''))

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ generator-værn for dedikerede migrationer (00235, 00239) og erstattet læsning (00192–00242) ok')
process.exitCode = bad ? 1 : 0
