/**
 * Download-ikonet paa vedhaeftningsknappen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-pending-dl-icon-wrap-test.ts
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
const id = 'data-testid="mail-pending-dl-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 50, at + 10) : ''
const bare = '<Download className="w-4 h-4" />'
const cell = '<Download className="w-4 h-4 break-words min-w-0" data-testid="mail-pending-dl-icon" />'
ok(row.includes('<Download'), 'det er ikonet')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('vedhæftninger'), 'teksten er et andet sted')
ok(!row.includes('mail-attachments-download-button'), 'knappen er et andet sted')
ok(!row.includes('Loader2'), 'spinneren er et andet sted')
ok(!row.includes('isBackfilling'), 'tilstanden er et andet sted')
ok(!row.includes('text-gray-300'), 'listeikonet er et andet sted')
ok(!row.includes('mail-lightbox'), 'lightbox er et andet sted')
ok(!row.includes('text-amber-800'), 'venteteksten er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('Download vedhæftninger nu'), 'teksten bliver')
ok(view.includes('data-testid="mail-attachments-download-button"'), 'knappen bliver')
ok(view.includes('data-testid="mail-lightbox-download-icon"'), 'lightbox-ikonet bliver')
ok(view.includes('<Download className="w-4 h-4 text-gray-300 group-hover:text-blue-500 shrink-0 break-words min-w-0" />'), 'listeikonet ombrydes')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-pending-dl-icon-wrap-test')
