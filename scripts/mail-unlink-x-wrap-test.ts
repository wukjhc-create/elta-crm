/**
 * Luk-ikonet paa Fjern kobling kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-unlink-x-wrap-test.ts
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
const id = 'data-testid="mail-unlink-x"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 43, at + 10) : ''
const bare = '<X className="w-3 h-3" />'
const cell = '<X className="w-3 h-3 break-words min-w-0" data-testid="mail-unlink-x" />'
ok(row.includes('<X'), 'det er ikonet')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('kobling'), 'teksten er et andet sted')
ok(!row.includes('mail-unlink-button'), 'knappen er et andet sted')
ok(!row.includes('Loader2'), 'spinneren er et andet sted')
ok(!row.includes('isUnlinking'), 'tilstanden er et andet sted')
ok(!row.includes('lightbox'), 'lightbox er et andet sted')
ok(!row.includes('ExternalLink'), 'pilen er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('Fjern kobling'), 'teksten bliver')
ok(view.includes('data-testid="mail-unlink-button"'), 'knappen bliver')
ok(view.includes('data-testid="mail-lightbox-close-icon"'), 'lightbox-ikonet bliver')
ok(view.includes('Åbn kunde <ExternalLink className="w-3 h-3" />'), 'kundepilen bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-unlink-x-wrap-test')
