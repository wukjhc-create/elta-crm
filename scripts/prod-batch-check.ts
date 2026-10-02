/**
 * PRODUCTION read-only: samlet pre-/post-check for prod-gate-batchen 00175–00183 i køreplanens rækkefølge
 * (docs/runbooks/PROD-GATE-BATCH-2026-10.md). Kører hvert eksisterende verify-script som separat proces (hver sin
 * read-only session) og opsummerer. Ændrer intet.
 *   npx tsx scripts/prod-batch-check.ts pre    — før batchen: alle trin skal være ✅ (= før-tilstand som forventet)
 *   npx tsx scripts/prod-batch-check.ts post   — efter hele batchen
 * Under selve kørslen bruges trinnets eget script før/efter hver migration (stop ved første afvigelse).
 */
import { spawnSync } from 'child_process'

const phase = process.argv[2]
if (phase !== 'pre' && phase !== 'post') { console.error('brug: pre|post'); process.exit(2) }

/** Rækkefølge = køreplanen: 00180 og 00181 først (Henrik 2026-10-02). */
const STEPS: Array<{ nr: string; what: string; args: string[] }> = [
  { nr: '00180', what: 'montør kun mails på egne sager + serviceleder ser medarbejdere', args: ['scripts/prod-verify-00180.ts', phase] },
  { nr: '00181', what: 'WAVE5 work_orders: montør kun egne', args: ['scripts/prod-verify-rls-wave.ts', 'WAVE5', phase] },
  { nr: '00175–00177, 00179', what: 'læse-lockdown (tokens, hemmeligheder, beskeder, underskrifter)', args: ['scripts/prod-verify-read-lockdown.ts', 'all', phase] },
  { nr: '00178', what: 'WAVE4 kalkulations-/katalogtabeller', args: ['scripts/prod-verify-rls-wave.ts', 'WAVE4', phase] },
  { nr: '00182', what: 'audit-identitet kan ikke forfalskes', args: ['scripts/prod-verify-00182.ts', phase] },
  { nr: '00183', what: 'trigram-indeks produktsøgning', args: ['scripts/prod-verify-00183.ts', phase] },
]

const results: Array<{ nr: string; what: string; ok: boolean; code: number | null }> = []
for (const s of STEPS) {
  console.log(`\n================ ${s.nr} (${phase}) — ${s.what} ================`)
  const r = spawnSync('npx', ['tsx', ...s.args], { stdio: 'inherit', shell: process.platform === 'win32' })
  results.push({ nr: s.nr, what: s.what, ok: r.status === 0, code: r.status })
}
console.log(`\n================ SAMLET ${phase.toUpperCase()} ================`)
for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.nr.padEnd(20)} ${r.what}${r.ok ? '' : ` (exit ${r.code})`}`)
const bad = results.filter((r) => !r.ok).length
console.log(bad ? `\n❌ ${bad} trin afviger — STOP` : `\n✅ alle ${results.length} trin som forventet (${phase})`)
process.exitCode = bad ? 2 : 0
