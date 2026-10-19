/**
 * Ikonet paa Kobl til eksisterende i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-kobl-icon-wrap-test.ts
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
const id = 'data-testid="mail-kobl-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 70, at + 10) : ''
const cell = '<Link2 className="w-4 h-4 break-words min-w-0" data-testid="mail-kobl-icon" />'
const bare = '<Link2 className="w-4 h-4" />'
ok(row.includes('<Link2'), 'det er ikonet')
ok(row.includes('w-4 h-4'), 'stoerrelsen bliver')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('Kobl til eksisterende'), 'teksten er et andet sted')
ok(!row.includes('mail-kobl-button'), 'knappen er et andet sted')
ok(!row.includes('bg-blue-600'), 'knapfarven er et andet sted')
ok(!row.includes('<button'), 'knap-tagget er et andet sted')
ok(!row.includes('onClick={onLink}'), 'klikket er et andet sted')
ok(!row.includes('mail-link2-icon'), 'det andet ikon er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('Kobl til eksisterende'), 'teksten bliver')
ok(view.includes('data-testid="mail-kobl-button"'), 'knappen bliver')
ok(view.includes('onClick={onLink}'), 'klikket bliver')
ok(view.includes('data-testid="mail-link2-icon"'), 'det koblede ikon bliver')
ok(view.includes('Opret som ny kunde'), 'opret-teksten bliver')
ok(view.includes('data-testid="mail-opret-kunde-icon"'), 'opret-ikonet bliver')
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
console.log('PASS  mail-kobl-icon-wrap-test')
