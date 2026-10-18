/**
 * Sagspanelets "Henter…" ombrydes. Sætningen er uændret.
 *   npx tsx scripts/case-aftercalc-loading-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = view.indexOf('data-testid="case-aftercalc-loading"')
const row = start >= 0 ? view.slice(start - 90, start + 160) : ''
ok(row.includes('data-testid="case-aftercalc-loading"'), 'venteteksten kan findes')
ok(row.includes('break-words min-w-0'), 'venteteksten ombrydes')
ok(row.includes('> Henter…</p>'), 'sætningen er uændret')
ok(row.includes('Loader2 className="w-4 h-4 animate-spin"'), 'spinneren er uændret')
ok(!row.includes('truncate'), 'venteteksten klippes ikke')
ok(!view.includes('truncate'), 'panelet klipper ikke')
ok(view.includes('{!error && !data &&'), 'fejlen vises ikke som venten')
ok(view.includes('Det tælles ikke som 0 kr.'), 'nul-reglen er uændret')
ok(view.includes('Kan ikke beregnes'), 'ukendt beløb er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  case-aftercalc-loading-wrap-test')
