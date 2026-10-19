/**
 * Ikonet paa Opret tilbud i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-create-offer-icon-wrap-test.ts
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
const id = 'data-testid="mail-create-offer-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = '<FilePlus className="w-4 h-4 break-words min-w-0" data-testid="mail-create-offer-icon" />'
const bare = '<FilePlus className="w-4 h-4" />'
ok(row.includes('<FilePlus'), 'det er ikonet')
ok(row.includes('w-4 h-4'), 'stoerrelsen bliver')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('Opret tilbud'), 'teksten er et andet sted')
ok(!row.includes('data-testid="mail-create-offer"'), 'linket er et andet sted')
ok(!row.includes('<Link'), 'link-tagget er et andet sted')
ok(!row.includes('nytilbud=1'), 'href er et andet sted')
ok(!row.includes('border-emerald-600'), 'linkfarven er et andet sted')
ok(!row.includes('Opret sag'), 'opret-sag-teksten er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('Opret tilbud'), 'teksten bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'linket bliver')
ok(view.includes('?nytilbud=1'), 'href bliver')
ok(view.includes('Opret sag'), 'opret-sag-teksten bliver')
ok(view.includes('data-testid="mail-opret-sag-button"'), 'opret-sag-knappen bliver')
ok(view.includes('data-testid="mail-action-row"'), 'handlingsraekken bliver')
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
console.log('PASS  mail-create-offer-icon-wrap-test')
