/**
 * Linjestatus på sagspanelet ombrydes. Statusordene er uændret.
 *   npx tsx scripts/aftercalc-line-status-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'orders', '[id]', 'case-aftercalc-panel.tsx'), 'utf8')
const status = view.slice(view.indexOf('const STATUS'), view.indexOf('const kr'))
for (const word of ['Som tilbudt', 'Over budget', 'Under budget', 'Ikke brugt', 'Ekstra / ikke tilbudt', 'Mangler kostdata', 'Ikke matchet']) {
  ok(status.includes(`label: '${word}'`), `statusordet ${word} er uændret`)
}

const mobileAt = view.indexOf('data-testid="aftercalc-lines-mobile"')
const desktopAt = view.indexOf('hidden md:block overflow-x-auto', mobileAt)
const mobile = mobileAt >= 0 && desktopAt > mobileAt ? view.slice(mobileAt, desktopAt) : ''
const mobileStatus = mobile.indexOf('data-testid="aftercalc-mobile-line-status"')
const mobileRow = mobileStatus >= 0 ? mobile.slice(mobileStatus - 220, mobileStatus + 80) : ''
ok(mobileRow.includes('break-words min-w-0'), 'mobilstatus ombrydes')
ok(mobileRow.includes('{STATUS[r.status].label}'), 'mobilstatus bruger de samme ord')
ok(!mobileRow.includes('shrink-0'), 'mobilstatus kan blive smallere')
ok(!mobile.includes(' truncate') && !mobile.includes('truncate '), 'mobilkortet klippes ikke')

const deskAt = view.indexOf('data-testid="aftercalc-desktop-line-status"')
const desk = deskAt >= 0 ? view.slice(deskAt - 280, deskAt + 80) : ''
ok(desk.includes('break-words min-w-0'), 'skrivebordsstatus ombrydes')
ok(desk.includes('{STATUS[r.status].label}'), 'skrivebordsstatus bruger de samme ord')
ok(!desk.includes(' truncate') && !desk.includes('truncate '), 'skrivebordsstatus klippes ikke')
ok(!view.includes('truncate'), 'panelet klipper ikke tekst')
ok(view.includes('En linje kobles kun, når materialet peger på tilbudslinjen'), 'linjereglen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  aftercalc-line-status-wrap-test')
