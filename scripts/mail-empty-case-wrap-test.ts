/**
 * Teksten Ingen sag tilknyttet kan krympe. Sagsvaelgeren bliver.
 *   npx tsx scripts/mail-empty-case-wrap-test.ts
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
const id = 'data-testid="mail-empty-case"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const bare = '<span className="text-gray-600">Ingen sag tilknyttet</span>'
const cell = '<span className="text-gray-600 break-words min-w-0" data-testid="mail-empty-case">Ingen sag tilknyttet</span>'
ok(row.includes('<span'), 'det er teksten')
ok(row.includes('break-words min-w-0'), 'teksten kan krympe')
ok(!row.includes('Ingen sag'), 'ordene er et andet sted')
ok(!row.includes('mail-case-picker-load-error'), 'fejlen er et andet sted')
ok(!row.includes('truncate'), 'vaelgeren er et andet sted')
ok(!row.includes('mail-no-cases'), 'ingen-sager er et andet sted')
ok(view.split(id).length === 2, 'teksten findes en gang')
ok(view.split(cell).length === 2, 'tekstklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare tekst er vaek')
ok(view.includes('Ingen sag tilknyttet'), 'ordene bliver')
ok(view.includes('data-testid="mail-no-cases"'), 'ingen-sager bliver')
ok(view.includes('data-testid="mail-case-picker-load-error"'), 'fejlen bliver')
ok(view.includes('max-w-[280px] truncate'), 'vaelgeren bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-empty-case-wrap-test')
