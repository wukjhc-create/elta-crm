/**
 * Tilbudsnummeret på påvirkede tilbud ombrydes. Nummeret og linket er uændret.
 *   npx tsx scripts/pricing-offer-number-wrap-test.ts
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
const expr = '{offer.offer_number}'
const href = 'href={`/dashboard/offers/${offer.offer_id}`}'

const mobileAt = view.indexOf('data-testid="pricing-offer-number-mobile"')
const mobile = mobileAt >= 0 ? view.slice(mobileAt - 220, mobileAt + 120) : ''
ok(mobile.includes('break-all'), 'mobil ombrydes')
ok(mobile.includes(expr), 'mobilnummeret er uændret')
ok(mobile.includes(href), 'mobillinket er uændret')

const deskAt = view.indexOf('data-testid="pricing-offer-number"')
const desk = deskAt >= 0 ? view.slice(deskAt - 220, deskAt + 120) : ''
ok(desk.includes('break-words min-w-0'), 'skrivebord ombrydes')
ok(desk.includes(expr), 'skrivebordsnummeret er uændret')
ok(desk.includes(href), 'skrivebordslinket er uændret')
ok(view.includes('break-words max-w-[16rem] min-w-0" data-testid="pricing-offer-title">{offer.offer_title}'), 'titlen bliver')
ok(view.split(expr).length - 1 === 2, 'to numre')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-number-wrap-test')
