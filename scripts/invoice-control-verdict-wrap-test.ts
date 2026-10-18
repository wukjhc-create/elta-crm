/**
 * Linjedommen på fakturakontrollen ombrydes. Domsteksten er uændret.
 *   npx tsx scripts/invoice-control-verdict-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const line = view.slice(view.indexOf('const LINE'), view.indexOf('const METHOD'))
for (const word of ["ok: 'OK'", "overcharge: 'Overpris'", "undercharge: 'Underpris'", "not_controllable: '—'"]) {
  ok(line.includes(word), `dommen ${word} er uændret`)
}

const mobileStart = view.indexOf('invoice-control-lines-mobile')
const mobileEnd = view.indexOf('hidden md:block', mobileStart)
const mobile = mobileStart >= 0 && mobileEnd > mobileStart ? view.slice(mobileStart, mobileEnd) : ''
const mobileAt = mobile.indexOf('data-testid="invoice-control-mobile-verdict"')
const mobileRow = mobileAt >= 0 ? mobile.slice(mobileAt - 280, mobileAt + 80) : ''
ok(mobileRow.includes('shrink-0 max-w-[45%] break-words min-w-0'), 'mobil-dommen ombrydes og bliver på linjen')
ok(mobileRow.includes('{LINE[l.verdict] ?? l.verdict}'), 'mobil-dommen bruger de samme ord')
ok(mobileRow.includes("bad ? 'text-red-700 font-medium' : l.verdict === 'ok' ? 'text-green-700' : 'text-gray-600'"), 'mobil-farven er uændret')

const deskAt = view.indexOf('data-testid="invoice-control-desktop-verdict"')
const desk = deskAt >= 0 ? view.slice(deskAt - 240, deskAt + 80) : ''
ok(desk.includes('break-words min-w-0'), 'skrivebords-dommen ombrydes')
ok(desk.includes('{LINE[l.verdict] ?? l.verdict}'), 'skrivebords-dommen bruger de samme ord')
ok(desk.includes("bad ? 'text-red-700 font-medium' : l.verdict === 'ok' ? 'text-green-700' : ''"), 'skrivebords-farven er uændret')
ok(view.includes('Ingen linje kunne kontrolleres. Det tælles ikke som 0 kr.'), 'nul-linjen er uændret')
ok(!mobile.includes(' truncate') && !mobile.includes('truncate '), 'mobilkortet klippes ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-verdict-wrap-test')
