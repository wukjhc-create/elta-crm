/**
 * Mobil-linjens enhed ombrydes. Beskrivelse og antal er uændret.
 *   npx tsx scripts/aftercalc-mobile-unit-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const panel = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const start = panel.indexOf('data-testid="aftercalc-lines-mobile"')
const end = panel.indexOf('hidden md:block', start)
const mobile = start >= 0 && end > start ? panel.slice(start, end) : ''
ok(mobile.includes('break-words min-w-0">{r.unit}'), 'enheden ombrydes')
ok(mobile.includes('text-gray-900 break-words">{r.description}'), 'beskrivelsen er uændret')
ok(mobile.includes('break-words min-w-0">Tilbudt antal {qty(r.offered_qty)}'), 'antallet er uændret')
ok(!mobile.includes('truncate'), 'enheden klippes ikke')

const rowStart = panel.indexOf('data-testid="aftercalc-line"')
const rowEnd = panel.indexOf('</tr>', rowStart)
const row = rowStart >= 0 && rowEnd > rowStart ? panel.slice(rowStart, rowEnd) : ''
ok(row.includes('break-words min-w-0">{r.unit}'), 'skrivebords-enheden er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-mobile-unit-wrap-test')
