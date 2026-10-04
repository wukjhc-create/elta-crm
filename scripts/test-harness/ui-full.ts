/**
 * Fuld UI-regression uden at ramme watchdog'ens 30-min-loft (Henrik 2026-10-04: ingen lange samlede kørsler, ingen
 * vente-løkker der blokerer).
 *   npm run harness:ui-full                 — alle grupper i UI_E2E_GROUPS
 *   npm run harness:ui-full -- sales,montor — udvalgte grupper
 *
 * - Testene (unikke, i gruppernes rækkefølge) deles i batches à 5 og kørsler à højst 4 batches (~15–20 min).
 *   Første kørsel bygger; resten genbruger buildet (UI_E2E_REUSE_BUILD=1). Afhængigheder lægger ui-batches selv til.
 * - Tests der ikke nåede at køre (NOT_RUN/FAILED_TIMEOUT pga. loftet) samles i en ekstra kørsel til sidst.
 * - FAIL køres én gang mere isoleret: grøn anden gang = FLAKY (rapporteres), rød igen = FAIL.
 * Resultat: samlet tabel + %TEMP%/elta-ui-e2e/full-<tid>.json. Exit 1 hvis noget er FAIL.
 */
import { spawnSync } from 'child_process'
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { UI_E2E_GROUPS } from './ui-e2e'

type Status = 'PASS' | 'FAIL' | 'FAILED_TIMEOUT' | 'NOT_RUN'
type Res = { test: string; status: Status; seconds: number; batch: number; note: string }

const BASE_TESTS = new Set(['U1', 'U2', 'U3', 'U4', 'U5', 'U6'])
const dir = join(tmpdir(), 'elta-ui-e2e')
mkdirSync(dir, { recursive: true })

const groupArg = (process.argv[2] ?? '').trim()
const groups = groupArg ? groupArg.split(',').map((g) => g.trim()).filter(Boolean) : Object.keys(UI_E2E_GROUPS)
for (const g of groups) if (!UI_E2E_GROUPS[g]) { console.error(`ukendt gruppe '${g}' (${Object.keys(UI_E2E_GROUPS).join('|')})`); process.exit(2) }
const tests: string[] = []
for (const g of groups) for (const t of UI_E2E_GROUPS[g]) if (!tests.includes(t) && !BASE_TESTS.has(t)) tests.push(t)

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

function newestBatchesJson(since: number): string | null {
  const files = readdirSync(dir).filter((f) => f.startsWith('batches-') && f.endsWith('.json'))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).filter((x) => x.t >= since).sort((a, b) => b.t - a.t)
  return files[0] ? join(dir, files[0].f) : null
}

let built = false
function runBatches(batches: string[][], label: string): Res[] {
  const started = Date.now()
  console.log(`\n=== ${label}: ${batches.map((b) => b.join(',')).join(' ')} (${built ? 'genbruger build' : '+build'})`)
  const r = spawnSync(process.execPath, [join('node_modules', 'tsx', 'dist', 'cli.mjs'), join('scripts', 'test-harness', 'ui-batches.ts'), ...batches.map((b) => b.join(','))], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ...(built ? { UI_E2E_REUSE_BUILD: '1' } : {}) },
    timeout: 32 * 60_000,
  })
  built = true
  const file = newestBatchesJson(started)
  if (!file) {
    console.error(`[ui-full] ${label}: intet resultat (exit ${r.status}) — alle markeres NOT_RUN`)
    return batches.flat().map((t) => ({ test: t, status: 'NOT_RUN' as const, seconds: 0, batch: 0, note: 'ingen resultatfil' }))
  }
  return (JSON.parse(readFileSync(file, 'utf8')).results as Res[])
}

const final = new Map<string, Res & { flaky?: boolean }>()
const runs = chunk(chunk(tests, 5), 4)
runs.forEach((batches, i) => {
  for (const res of runBatches(batches, `kørsel ${i + 1}/${runs.length}`)) if (tests.includes(res.test)) final.set(res.test, res)
})

// Ikke nået (loftet) → én samlet ekstra kørsel
const notRun = tests.filter((t) => { const s = final.get(t)?.status; return !s || s === 'NOT_RUN' || s === 'FAILED_TIMEOUT' })
if (notRun.length) for (const res of runBatches(chunk(notRun, 5), `ikke nået (${notRun.length})`)) if (tests.includes(res.test)) final.set(res.test, res)

// FAIL → én isoleret genkørsel (flaky-detektion)
const failed = tests.filter((t) => final.get(t)?.status === 'FAIL')
if (failed.length) {
  for (const res of runBatches(failed.map((t) => [t]), `genkørsel af FAIL (${failed.length})`)) {
    if (!failed.includes(res.test)) continue
    final.set(res.test, res.status === 'PASS' ? { ...res, flaky: true } : res)
  }
}

const rows = tests.map((t) => final.get(t) ?? { test: t, status: 'NOT_RUN' as Status, seconds: 0, batch: 0, note: '' })
const label = (r: Res & { flaky?: boolean }) => (r.flaky ? 'FLAKY' : r.status)
console.log(`\n=== UI-FULL (${groups.join(',')}) — ${rows.length} tests ===`)
for (const r of rows) if (label(r) !== 'PASS') console.log(`  ${label(r).padEnd(14)} ${r.test.padEnd(6)} ${r.note.slice(0, 160)}`)
const count = (s: string) => rows.filter((r) => label(r) === s).length
console.log(`  PASS=${count('PASS')} FLAKY=${count('FLAKY')} FAIL=${count('FAIL')} TIMEOUT=${count('FAILED_TIMEOUT')} NOT_RUN=${count('NOT_RUN')}`)
writeFileSync(join(dir, `full-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(rows, null, 1))
process.exit(rows.some((r) => !r.flaky && r.status !== 'PASS') ? 1 : 0)
