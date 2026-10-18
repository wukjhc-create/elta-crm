/**
 * Etiketterne Tærskel og Periode ombrydes. Valgmulighederne er uændret.
 *   npx tsx scripts/pricing-filter-label-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const labels: Array<[string, string]> = [
  ['pricing-threshold-label', '>Tærskel:<'],
  ['pricing-period-label', '>Periode:<'],
]
for (const [id, word] of labels) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 80, at + 55) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(word), `${word} er uændret`)
}
ok(view.includes('setThreshold(Number(e.target.value))'), 'taerskel-handlingen bliver')
ok(view.includes('setDaysBack(Number(e.target.value))'), 'periode-handlingen bliver')
ok(view.includes('>2%+<') && view.includes('>5%+<') && view.includes('>10%+<') && view.includes('>20%+<'), 'taerskelvalg bliver')
ok(view.includes('>Sidste 24 timer<') && view.includes('>Sidste 7 dage<') && view.includes('>Sidste 14 dage<') && view.includes('>Sidste 30 dage<'), 'periodevalg bliver')
ok(view.includes('{isText ? value : value}'), 'oversigtstallet bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-filter-label-wrap-test')
