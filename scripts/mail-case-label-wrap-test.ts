/**
 * Sag-etiketten i sagsvaelgeren kan krympe. Teksten Sag bliver.
 * Sagslinket bliver.
 *   npx tsx scripts/mail-case-label-wrap-test.ts
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
const id = 'data-testid="mail-case-label"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 38, at + 10) : ''
const cell = '<span className="break-words min-w-0" data-testid="mail-case-label">'
ok(row.startsWith('<span'), 'det er etiketten')
ok(row.includes('break-words min-w-0'), 'etiketten kan krympe')
ok(!row.includes('Sag'), 'teksten er et andet sted')
ok(!row.includes('currentCase'), 'sagen er et andet sted')
ok(!row.includes('mail-case-link'), 'linket er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(view.split(id).length === 2, 'etiketten findes en gang')
ok(view.split(cell).length === 2, 'etiketklassen findes en gang')
ok(view.split('<span>').length === 1, 'ingen bart span bliver')
ok(view.includes("Sag:{' '}"), 'teksten bliver')
ok(view.includes('data-testid="mail-case-link"'), 'linket bliver')
ok(view.includes('{currentCase.case_number} — {currentCase.title}'), 'sagsnavnet bliver')
ok(view.includes('href={`/dashboard/orders/${currentCase.id}`}'), 'href bliver')
ok(view.includes('max-w-[280px] truncate'), 'vaelgeren bliver klippet')
ok(view.split('data-testid="mail-case-picker-load-error"').length === 3, 'fejl-id bliver')
ok(view.split('data-testid="mail-case-link"').length === 2, 'link-id kolliderer ikke')
ok(view.split('data-testid="mail-case-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.includes('<option value="">— Ingen sag —</option>'), 'valget bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')
ok(view.includes('data-testid="mail-match-kobl-button"'), 'match-knappen bliver')
ok(view.includes('data-testid="mail-other-kobl-button"'), 'forslag-knappen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-case-label-wrap-test')
