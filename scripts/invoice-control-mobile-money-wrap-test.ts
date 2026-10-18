/**
 * Forventet pris og afvigelse på fakturakontrollens mobilkort ombrydes.
 * Beløbene er uændret.
 *   npx tsx scripts/invoice-control-mobile-money-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const start = view.indexOf('invoice-control-lines-mobile')
const end = view.indexOf('hidden md:block', start)
const mobile = start >= 0 && end > start ? view.slice(start, end) : ''

const expectedAt = mobile.indexOf('data-testid="invoice-control-mobile-expected"')
const expected = expectedAt >= 0 ? mobile.slice(expectedAt - 40, expectedAt + 140) : ''
ok(expected.includes('break-words min-w-0'), 'forventet pris ombrydes')
ok(expected.includes("Forventet {m?.expectedUnitPrice != null ? kr(m.expectedUnitPrice) : '—'}"), 'forventet beløb er uændret')

const devAt = mobile.indexOf('data-testid="invoice-control-mobile-deviation"')
const dev = devAt >= 0 ? mobile.slice(devAt - 40, devAt + 260) : ''
ok(dev.includes('break-words min-w-0'), 'afvigelsen ombrydes')
ok(dev.includes("Afvigelse {l.varianceAmount != null && l.verdict !== 'not_controllable'"), 'ukontrollerbar afvigelse tælles stadig ikke')
ok(dev.includes('`${kr(l.varianceAmount)}${l.variancePct != null ? ` (${l.variancePct} %)` : \'\'}`'), 'afvigelsesbeløbet er uændret')
ok(view.includes('data-testid="invoice-control-desktop-expected"'), 'skrivebordets forventede pris bliver')
ok(view.includes('data-testid="invoice-control-desktop-deviation"'), 'skrivebordets afvigelse bliver')
ok(view.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), 'nul-linjen er uændret')
ok(!expected.includes(' truncate') && !expected.includes('truncate ') && !dev.includes(' truncate') && !dev.includes('truncate '), 'beløbene klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-mobile-money-wrap-test')
