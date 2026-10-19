/**
 * Ikonet paa Opret som ny kunde i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-opret-kunde-icon-wrap-test.ts
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
const id = 'data-testid="mail-opret-kunde-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = '<UserPlus className="w-4 h-4 break-words min-w-0" data-testid="mail-opret-kunde-icon" />'
const bare = '<UserPlus className="w-4 h-4" />'
ok(row.includes('<UserPlus'), 'det er ikonet')
ok(row.includes('w-4 h-4'), 'stoerrelsen bliver')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('Opret som ny kunde'), 'teksten er et andet sted')
ok(!row.includes('mail-opret-kunde-button'), 'knappen er et andet sted')
ok(!row.includes('bg-green-600'), 'knapfarven er et andet sted')
ok(!row.includes('<button'), 'knap-tagget er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('Opret som ny kunde'), 'teksten bliver')
ok(view.includes('data-testid="mail-opret-kunde-button"'), 'knappen bliver')
ok(view.includes('onClick={() => setShowCreateCustomerModal(true)}'), 'klikket bliver')
ok(view.includes('<Link2 className="w-4 h-4" />'), 'kobl-ikonet bliver')
ok(view.includes('Kobl til eksisterende'), 'kobl-teksten bliver')
ok(view.includes('data-testid="mail-task-title"'), 'opgavetitlen bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-opret-kunde-icon-wrap-test')
