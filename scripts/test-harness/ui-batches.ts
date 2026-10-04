/**
 * UI-e2e i små batches med watchdog (Henrik 2026-10-02, permanent test-politik):
 *   - ingen testproces > 30 min i alt, ingen batch > 15 min, ingen enkelt UI-test > 5 min uden begrundelse
 *   - hver batch er sin egen proces (`harness:ui-e2e` med UI_E2E_ONLY), bygget én gang og derefter genbrugt
 *   - watchdog: PID, batch, aktiv test, starttid, forløbet tid; ingen nyt testresultat i 5 min → den aktive test
 *     markeres FAILED_TIMEOUT, procestræet dræbes, sidste output gemmes, og batchens resterende tests køres videre
 *
 *   npx tsx scripts/test-harness/ui-batches.ts U11,U40,U44 U63,U66 U10,U23,U25     (hvert argument = én batch, max 5)
 *   UI_BATCH_TEST_TIMEOUT_S=300 UI_BATCH_TIMEOUT_S=900 UI_BATCH_TOTAL_S=1800 (standard)
 * Resultat: tabel pr. test (status, varighed) + %TEMP%/elta-ui-e2e/batches-<tid>.json og watchdog-<tid>.log.
 */
import { spawn, execSync, type ChildProcess } from 'child_process'
import { writeFileSync, appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const TEST_TIMEOUT = Number(process.env.UI_BATCH_TEST_TIMEOUT_S ?? 300) * 1000
const BATCH_TIMEOUT = Number(process.env.UI_BATCH_TIMEOUT_S ?? 900) * 1000
const TOTAL_TIMEOUT = Number(process.env.UI_BATCH_TOTAL_S ?? 1800) * 1000
const BASE = new Set(['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U13']) // køres altid af harness'en (login/adgang/konsolfejl)
/** Tests der genbruger en anden tests data (fx U11's montørsag) — afhængigheden tilføjes automatisk forrest i batchen. */
const DEPS: Record<string, string[]> = { U40: ['U11'], U44: ['U11'], U63: ['U11'], U66: ['U11'], U71: ['U11'], U73: ['U11'], U79: ['U11'], U80: ['U11'], U62: ['U11'], U72: ['U11'], U90: ['U11'], U97: ['U11'], U117: ['U11'], U108: ['U11'], U8: ['U7'], U9: ['U7', 'U8'], U16: ['U7', 'U8'] }

const dir = join(tmpdir(), 'elta-ui-e2e')
mkdirSync(dir, { recursive: true })
const tag = new Date().toISOString().replace(/[:.]/g, '-')
const wdLog = join(dir, `watchdog-${tag}.log`)
const log = (s: string) => { const line = `[watchdog ${new Date().toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen' })}] ${s}`; console.log(line); appendFileSync(wdLog, line + '\n') }

type Result = { test: string; status: 'PASS' | 'FAIL' | 'FAILED_TIMEOUT' | 'NOT_RUN'; seconds: number; batch: number; note: string }
const results: Result[] = []

const batches = process.argv.slice(2).map((a) => {
  const ids = a.split(',').map((x) => x.trim()).filter(Boolean)
  const withDeps: string[] = []
  for (const id of ids) for (const d of [...(DEPS[id] ?? []), id]) if (!withDeps.includes(d)) withDeps.push(d)
  return withDeps
})
if (!batches.length || batches.some((b) => b.length === 0 || b.length > 5)) {
  console.error('brug: ui-batches.ts U11,U40 U63,U66 …  (1–5 tests pr. batch)'); process.exit(2)
}

function killTree(child: ChildProcess) {
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' })
    else child.kill('SIGKILL')
  } catch { /* allerede stoppet */ }
}

/** Kør én batch; returnerer de tests der ikke nåede at køre (efter timeout) så de kan køres videre. */
function runBatch(n: number, tests: string[], build: boolean, deadline: number): Promise<string[]> {
  return new Promise((resolve) => {
    const env = { ...process.env, UI_E2E_ONLY: tests.join(','), ...(build ? {} : { UI_E2E_REUSE_BUILD: '1' }) }
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', '-s', 'harness:ui-e2e'], { env, shell: process.platform === 'win32' })
    const batchStart = Date.now()
    let lastResultAt = Date.now()
    let tail: string[] = []
    const done = new Set<string>()
    let finished = false
    log(`batch ${n} start PID=${child.pid} tests=${tests.join(',')}${build ? ' (+build)' : ''}`)
    const onData = (d: Buffer) => {
      for (const line of String(d).split(/\r?\n/)) {
        if (!line.trim()) continue
        tail = [...tail.slice(-40), line]
        const m = /^\[ui-e2e [^\]]+\] (✓|❌) (U\d+)\b.*?\((\d+)s/.exec(line)
        if (m) {
          lastResultAt = Date.now()
          if (!BASE.has(m[2]) || tests.includes(m[2])) {
            done.add(m[2])
            results.push({ test: m[2], status: m[1] === '✓' ? 'PASS' : 'FAIL', seconds: Number(m[3]), batch: n, note: line.slice(0, 220) })
          }
        }
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    // Build tæller ikke som "test" — første resultat-ur starter når serveren svarer (første ✓/❌ eller build-linjen)
    const timer = setInterval(() => {
      const now = Date.now()
      const pending = tests.filter((t) => !done.has(t))
      const active = pending[0] ?? '(oprydning/basistests)'
      const idle = now - lastResultAt
      const buildPhase = build && !tail.some((l) => /build færdig/.test(l))
      if (buildPhase) lastResultAt = now
      const reason = now > deadline ? 'samlet grænse 30 min' : now - batchStart > BATCH_TIMEOUT ? 'batch > 15 min' : !buildPhase && idle > TEST_TIMEOUT ? `ingen resultat i ${Math.round(idle / 1000)} s` : null
      if (reason && !finished) {
        finished = true
        clearInterval(timer)
        log(`TIMEOUT batch ${n} PID=${child.pid} aktiv=${active} elapsed=${Math.round((now - batchStart) / 1000)}s (${reason}) — dræber procestræ`)
        log(`sidste output:\n    ${tail.slice(-12).join('\n    ')}`)
        killTree(child)
        if (pending.length) results.push({ test: pending[0], status: 'FAILED_TIMEOUT', seconds: Math.round(idle / 1000), batch: n, note: reason })
        // resterende tests i batchen køres videre (undtagen ved samlet grænse)
        resolve(now > deadline ? [] : pending.slice(1))
      }
    }, 5000)
    child.on('exit', (code) => {
      if (finished) return
      finished = true
      clearInterval(timer)
      const missing = tests.filter((t) => !done.has(t))
      log(`batch ${n} slut (exit ${code}) på ${Math.round((Date.now() - batchStart) / 1000)} s${missing.length ? ` — uden resultat: ${missing.join(',')}` : ''}`)
      if (missing.length || code !== 0) log(`sidste output:\n    ${tail.slice(-15).join('\n    ')}`)
      for (const t of missing) results.push({ test: t, status: 'NOT_RUN', seconds: 0, batch: n, note: tail.slice(-3).join(' | ').slice(0, 220) })
      resolve([])
    })
  })
}

async function main() {
  const t0 = Date.now()
  const deadline = t0 + TOTAL_TIMEOUT
  let built = false
  let n = 0
  const queue = [...batches]
  while (queue.length) {
    const b = queue.shift()!
    n++
    if (Date.now() > deadline) { for (const t of b) results.push({ test: t, status: 'NOT_RUN', seconds: 0, batch: n, note: 'samlet grænse 30 min nået' }); continue }
    const rest = await runBatch(n, b, !built, deadline)
    built = true
    if (rest.length) queue.unshift(rest)
  }
  const total = Math.round((Date.now() - t0) / 1000)
  console.log(`\n=== UI-BATCHES (${n} kørsler, ${total} s i alt) ===`)
  for (const r of results) console.log(`  ${r.status.padEnd(14)} ${r.test.padEnd(5)} ${String(r.seconds).padStart(4)} s  batch ${r.batch}${r.status === 'PASS' ? '' : `  ${r.note.slice(0, 160)}`}`)
  const bad = results.filter((r) => r.status !== 'PASS')
  writeFileSync(join(dir, `batches-${tag}.json`), JSON.stringify({ total_s: total, results }, null, 1))
  console.log(bad.length ? `❌ ${bad.length} ikke bestået (se ${wdLog})` : `✅ alle ${results.length} bestået`)
  process.exitCode = bad.length ? 1 : 0
}

main().catch((e) => { console.error(String(e)); process.exitCode = 1 })
