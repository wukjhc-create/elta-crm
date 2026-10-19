/**
 * Ikonet paa Kobl i e-mail-match kan krympe. Teksten Kobl bliver.
 * Ikonet i de andre forslag bliver.
 *   npx tsx scripts/mail-match-kobl-icon-wrap-test.ts
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
const id = 'data-testid="mail-match-kobl-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 47, at + 10) : ''
const bare = '<Link2 className="w-3 h-3" />'
const cell = '<Link2 className="w-3 h-3 break-words min-w-0" data-testid="mail-match-kobl-icon" />'
ok(row.includes('<Link2'), 'det er ikonet')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('Kobl'), 'teksten er et andet sted')
ok(!row.includes('s.id'), 'forslaget er et andet sted')
ok(!row.includes('detectedCustomer'), 'kaldet er et andet sted')
ok(!row.includes('\n'), 'knappen er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 2, 'det andet ikon bliver')
ok(view.includes('onLinkToCustomer?.(detectedCustomer.id)'), 'match-kaldet bliver')
ok(view.includes('onLinkToCustomer?.(s.id)'), 'forslag-kaldet bliver')
ok(view.includes('Kobl'), 'teksten bliver')
ok(view.includes('key={s.id}'), 'noeglen bliver')
ok(view.includes('data-testid="mail-suggest-match"'), 'match-kortet bliver')
ok(view.includes('data-testid="mail-suggest-other"'), 'forslag-kortet bliver')
ok(view.includes('data-testid="mail-chat-arrow"'), 'chatpilen bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-match-kobl-icon-wrap-test')
