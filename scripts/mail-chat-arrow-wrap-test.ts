/**
 * Pilen ved Hop til Chat kan krympe. Teksten Hop til Chat bliver.
 *   npx tsx scripts/mail-chat-arrow-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const view = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')
const id = 'data-testid="mail-chat-arrow"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 54, at + 10) : ''
const bare = 'Hop til Chat <ExternalLink className="w-3 h-3" />'
const cell = 'Hop til Chat <ExternalLink className="w-3 h-3 break-words min-w-0" data-testid="mail-chat-arrow" />'
ok(row.includes('<ExternalLink'), 'det er pilen')
ok(row.includes('break-words min-w-0'), 'pilen kan krympe')
ok(!row.includes('Hop'), 'teksten er et andet sted')
ok(!row.includes('Chat'), 'chatordet er et andet sted')
ok(!row.includes('mail-portal-link'), 'linket er et andet sted')
ok(!row.includes('mail-opgave-arrow'), 'opgavepilen er et andet sted')
ok(!row.includes('mail-kunde-arrow'), 'kundepilen er et andet sted')
ok(view.split(id).length === 2, 'pilen findes en gang')
ok(view.split(cell).length === 2, 'pilklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare pil er vaek')
ok(view.split('<ExternalLink className="w-3 h-3" />').length === 1, 'ingen bare pil bliver')
ok(view.includes('Hop til Chat'), 'teksten bliver')
ok(view.includes('data-testid="mail-opgave-arrow"'), 'opgavepilen bliver')
ok(view.includes('data-testid="mail-kunde-arrow"'), 'kundepilen bliver')
ok(view.includes('data-testid="mail-portal-link"'), 'portallinket bliver')
ok(view.includes('<Link2 className="w-3 h-3" />'), 'kobl-ikonet bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-chat-arrow-wrap-test')
