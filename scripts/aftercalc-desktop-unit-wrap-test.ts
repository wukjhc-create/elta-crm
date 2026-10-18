/**
 * Skrivebordslinjens enhed ombrydes. Beskrivelse og kost er uændret.
 *   npx tsx scripts/aftercalc-desktop-unit-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data-testid="aftercalc-line"')
const end = panel.indexOf('</tr>', start)
const row = start >= 0 && end > start ? panel.slice(start, end) : ''
ok(row.includes('break-words min-w-0">{r.unit}'), 'enheden ombrydes')
ok(row.includes('text-gray-900 break-words">{r.description}'), 'beskrivelsen er uændret')
ok(row.includes('break-words min-w-0">{kr(r.offered_cost)}'), 'kosten er uændret')
ok(!row.includes('truncate'), 'enheden klippes ikke')

const mobileStart = panel.indexOf('data-testid="aftercalc-lines-mobile"')
const mobileEnd = panel.indexOf('hidden md:block', mobileStart)
const mobile = mobileStart >= 0 && mobileEnd > mobileStart ? panel.slice(mobileStart, mobileEnd) : ''
ok(mobile.includes('text-[11px] text-gray-500 break-words min-w-0">{r.unit}'), 'mobil-enheden ombrydes')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-desktop-unit-wrap-test')
