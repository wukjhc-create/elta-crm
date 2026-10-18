/**
 * Statusmærket på påvirkede tilbud ombrydes. Etiketterne er uændret.
 *   npx tsx scripts/pricing-offer-status-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-offer-status"')
const row = at >= 0 ? view.slice(at - 160, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'maerket ombrydes')
ok(row.includes('{labels[status] || status}'), 'teksten kommer stadig fra labels')
ok(view.includes("draft: 'Kladde'"), 'Kladde bliver')
ok(view.includes("sent: 'Sendt'"), 'Sendt bliver')
ok(view.includes("viewed: 'Set'"), 'Set bliver')
ok(view.includes("accepted: 'Accepteret'"), 'Accepteret bliver')
ok(view.includes("rejected: 'Afvist'"), 'Afvist bliver')
ok(view.includes("expired: 'Udløbet'"), 'Udløbet bliver')
ok(view.includes("styles[status] || 'bg-gray-100 text-gray-700'"), 'fallback bliver')
ok(view.includes('<StatusBadge status={offer.status} />'), 'statussen kommer stadig fra offer.status')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-offer-status-wrap-test')
