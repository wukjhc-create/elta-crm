/**
 * Beskrivelsen på fakturakontrollens skrivebord kan krympe. Teksten er uændret.
 *   npx tsx scripts/invoice-control-description-wrap-test.ts
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
const deskEnd = view.indexOf('invoice-control-tolerance', deskStart)
const desk = deskStart >= 0 && deskEnd > deskStart ? view.slice(deskStart, deskEnd) : ''
const at = desk.indexOf('data-testid="invoice-control-desktop-description"')
const row = at >= 0 ? desk.slice(at - 50, at + 120) : ''
ok(row.includes('break-words min-w-0'), 'beskrivelsen kan krympe')
ok(row.includes('{l.description}<ChargeMark description={l.description} />'), 'teksten er uændret')
ok(!row.includes(' truncate') && !row.includes('truncate '), 'teksten klippes ikke')
ok(view.includes('text-gray-900 break-words min-w-0'), 'mobilens beskrivelse bliver')
ok(view.includes('<ChargeMark description={l.description} />'), 'fragt- og gebyrmærket bliver')
ok(view.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), 'nul-linjen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-description-wrap-test')
