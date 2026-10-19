/**
 * Ikonet paa Kobl i andre mailforslag kan krympe. Teksten Kobl bliver.
 * Ikonet i e-mail-match bliver.
 *   npx tsx scripts/mail-other-kobl-icon-wrap-test.ts
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
const id = 'data-testid="mail-other-kobl-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 47, at + 10) : ''
const bare = '<Link2 className="w-3 h-3" />'
const cell = '<Link2 className="w-3 h-3 break-words min-w-0" data-testid="mail-other-kobl-icon" />'
const button = 'className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"'
ok(row.includes('<Link2'), 'det er ikonet')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('Kobl'), 'teksten er et andet sted')
ok(!row.includes('s.id'), 'kaldet er et andet sted')
ok(!row.includes('detectedCustomer'), 'match-kaldet er et andet sted')
ok(!row.includes('\n'), 'knappen er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'ingen bart ikon bliver')
ok(view.includes('<Link2 className="w-3 h-3 break-words min-w-0" data-testid="mail-match-kobl-icon" />'), 'match-ikonet bliver')
ok(view.includes('onLinkToCustomer?.(s.id)'), 'forslag-kaldet bliver')
ok(view.includes('onLinkToCustomer?.(detectedCustomer.id)'), 'match-kaldet bliver')
ok(view.includes('Kobl'), 'teksten bliver')
ok(view.includes('key={s.id}'), 'noeglen bliver')
ok(view.includes('data-testid="mail-suggest-other"'), 'forslag-kortet bliver')
ok(view.includes('data-testid="mail-suggest-match"'), 'match-kortet bliver')
ok(view.split('data-testid="mail-match-kobl-icon"').length === 2, 'match-id kolliderer ikke')
ok(view.split('data-testid="mail-other-name"').length === 2, 'andre navn kolliderer ikke')
ok(view.split('data-testid="mail-other-number"').length === 2, 'andre nummer kolliderer ikke')
ok(view.split('data-testid="mail-kobl-icon"').length === 2, 'kobl-id kolliderer ikke')
ok(view.split(button).length === 2, 'e-mail-knappen bliver')
ok(view.includes('data-testid="mail-other-kobl-button"'), 'forslag-knappen bliver')
ok(view.split('<div className="flex-1 min-w-0">').length === 1, 'ingen bar kolonne bliver')
ok(view.includes('data-testid="mail-other-column"'), 'forslag-kolonnen bliver')
ok(view.includes('data-testid="mail-match-column"'), 'e-mail-kolonnen bliver')
ok(view.includes('data-testid="mail-chat-arrow"'), 'chatpilen bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-other-kobl-icon-wrap-test')
