/**
 * Pilen ved Abn kunde kan krympe. Teksten Abn kunde bliver.
 * Se opgave og Hop til Chat bliver.
 *   npx tsx scripts/mail-kunde-arrow-wrap-test.ts
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
const id = 'data-testid="mail-kunde-arrow"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 54, at + 10) : ''
const bare = 'Åbn kunde <ExternalLink className="w-3 h-3" />'
const cell = 'Åbn kunde <ExternalLink className="w-3 h-3 break-words min-w-0" data-testid="mail-kunde-arrow" />'
ok(row.includes('<ExternalLink'), 'det er pilen')
ok(row.includes('break-words min-w-0'), 'pilen kan krympe')
ok(!row.includes('Åbn'), 'teksten er et andet sted')
ok(!row.includes('kunde'), 'kundeordet er et andet sted')
ok(!row.includes('Se opgave'), 'opgaven er et andet sted')
ok(!row.includes('Hop til'), 'chatten er et andet sted')
ok(!row.includes('mail-open-customer-link'), 'linket er et andet sted')
ok(view.split(id).length === 2, 'pilen findes en gang')
ok(view.split(cell).length === 2, 'pilklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare pil er vaek')
ok(view.split('<ExternalLink className="w-3 h-3" />').length === 3, 'de to andre pile bliver')
ok(view.includes('Åbn kunde'), 'teksten bliver')
ok(view.includes('Se opgave <ExternalLink className="w-3 h-3" />'), 'opgavepilen bliver')
ok(view.includes('Hop til Chat <ExternalLink className="w-3 h-3" />'), 'chatpilen bliver')
ok(view.includes('data-testid="mail-open-customer-link"'), 'kundelinket bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-kunde-arrow-wrap-test')
