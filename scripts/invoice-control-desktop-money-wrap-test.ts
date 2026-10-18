/**
 * Forventet pris og afvigelse på fakturakontrollens skrivebord ombrydes.
 * kr() og not_controllable er uændret.
 *   npx tsx scripts/invoice-control-desktop-money-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const deskStart = view.indexOf('hidden md:block overflow-x-auto')
const desk = deskStart >= 0 ? view.slice(deskStart, view.indexOf('invoice-control-tolerance', deskStart)) : ''

const expectedAt = desk.indexOf('data-testid="invoice-control-desktop-expected"')
const expected = expectedAt >= 0 ? desk.slice(expectedAt - 80, expectedAt + 120) : ''
ok(expected.includes('text-right break-words min-w-0'), 'forventet pris ombrydes')
ok(expected.includes("{m?.expectedUnitPrice != null ? kr(m.expectedUnitPrice) : '—'}"), 'forventet beløb er uændret')

const devAt = desk.indexOf('data-testid="invoice-control-desktop-deviation"')
const dev = devAt >= 0 ? desk.slice(devAt - 80, devAt + 240) : ''
ok(dev.includes('text-right break-words min-w-0'), 'afvigelsen ombrydes')
ok(dev.includes("l.varianceAmount != null && l.verdict !== 'not_controllable'"), 'ukontrollerbar afvigelse tælles stadig ikke')
ok(dev.includes('`${kr(l.varianceAmount)}${l.variancePct != null ? ` (${l.variancePct} %)` : \'\'}`'), 'afvigelsesbeløbet er uændret')

ok(view.includes("const kr = (n: number) => `${n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`"), 'kr() er uændret')
ok(view.includes(">Forventet {m?.expectedUnitPrice != null ? kr(m.expectedUnitPrice) : '—'}</p>"), 'mobilens forventede pris er uændret')
ok(view.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), 'nul-linjen er uændret')
ok(!expected.includes(' truncate') && !expected.includes('truncate ') && !dev.includes(' truncate') && !dev.includes('truncate '), 'beløbene klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-desktop-money-wrap-test')
