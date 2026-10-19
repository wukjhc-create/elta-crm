/**
 * Valget Ingen sag kan krympe. Teksten bliver.
 * Sagsvaelgerens truncate bliver.
 *   npx tsx scripts/mail-no-case-option-wrap-test.ts
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
const id = 'data-testid="mail-no-case-option"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 49, at + 10) : ''
const bare = '<option value="">— Ingen sag —</option>'
const cell = '<option value="" className="break-words min-w-0" data-testid="mail-no-case-option">— Ingen sag —</option>'
ok(row.startsWith('<option'), 'det er valget')
ok(row.includes('break-words min-w-0'), 'valget kan krympe')
ok(!row.includes('Ingen'), 'teksten er et andet sted')
ok(!row.includes('—'), 'stregen er et andet sted')
ok(!row.includes('truncate'), 'vaelgeren er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(view.split(id).length === 2, 'valget findes en gang')
ok(view.split(cell).length === 2, 'valgklassen findes en gang')
ok(view.split(bare).length === 1, 'ingen bart valg bliver')
ok(view.includes('— Ingen sag —'), 'teksten bliver')
ok(view.includes('max-w-[280px] truncate'), 'vaelgeren bliver klippet')
ok(view.includes('title="Vælg sag"'), 'vaelg-titlen bliver')
ok(view.includes('data-testid="mail-case-label"'), 'sag-etiketten bliver')
ok(view.includes("Sag:{' '}"), 'sagteksten bliver')
ok(view.includes('Ingen sag tilknyttet'), 'den tomme sag bliver')
ok(view.split('data-testid="mail-case-picker-load-error"').length === 3, 'fejl-id bliver')
ok(view.split('data-testid="mail-empty-case"').length === 2, 'tom-id kolliderer ikke')
ok(view.split('data-testid="mail-no-cases"').length === 2, 'ingen-sager kolliderer ikke')
ok(view.includes("pendingAction === 'archive'"), 'arkiv-betingelsen bliver')
ok(view.includes('<Loader2 className="w-4 h-4 animate-spin" />'), 'spinneren bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-no-case-option-wrap-test')
