/**
 * Kobl-knappen i andre mailforslag kan krympe. Teksten Kobl bliver.
 * Knappen i e-mail-match bliver.
 *   npx tsx scripts/mail-other-kobl-button-wrap-test.ts
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
const id = 'data-testid="mail-other-kobl-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 174, at + 10) : ''
const bare = 'className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"'
const cell = 'className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors break-words min-w-0" data-testid="mail-other-kobl-button"'
ok(row.includes('className'), 'det er knappen')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(!row.includes('Kobl'), 'teksten er et andet sted')
ok(!row.includes('s.id'), 'kaldet er et andet sted')
ok(!row.includes('detectedCustomer'), 'match-kaldet er et andet sted')
ok(!row.includes('\n'), 'ikonet er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knapklassen findes en gang')
ok(view.split(bare).length === 2, 'e-mail-knappen bliver')
ok(view.includes('onLinkToCustomer?.(s.id)'), 'forslag-kaldet bliver')
ok(view.includes('onLinkToCustomer?.(detectedCustomer.id)'), 'match-kaldet bliver')
ok(view.includes('Kobl'), 'teksten bliver')
ok(view.includes('key={s.id}'), 'noeglen bliver')
ok(view.includes('data-testid="mail-other-kobl-icon"'), 'forslag-ikonet bliver')
ok(view.includes('data-testid="mail-match-kobl-icon"'), 'match-ikonet bliver')
ok(view.split('data-testid="mail-other-kobl-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-kobl-button"').length === 2, 'kobl-id kolliderer ikke')
ok(view.split('data-testid="mail-kobl-icon"').length === 2, 'det store ikon kolliderer ikke')
const matchAt = view.indexOf('onLinkToCustomer?.(detectedCustomer.id)')
const otherAt = view.indexOf('onLinkToCustomer?.(s.id)')
const matchButton = matchAt >= 0 ? view.slice(matchAt, matchAt + 360) : ''
ok(matchButton.includes(bare), 'e-mail-knappen er ved match-kaldet')
ok(!matchButton.includes(id), 'forslag-knappen er et andet sted')
ok(otherAt >= 0 && view.slice(otherAt, otherAt + 420).includes(id), 'forslag-knappen er ved forslag-kaldet')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-other-kobl-button-wrap-test')
