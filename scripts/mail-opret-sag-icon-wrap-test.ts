/**
 * Ikonet paa Opret sag i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-opret-sag-icon-wrap-test.ts
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
const id = 'data-testid="mail-opret-sag-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 70, at + 10) : ''
const cell = '<ExternalLink className="w-4 h-4 break-words min-w-0" data-testid="mail-opret-sag-icon" />'
const bare = '<ExternalLink className="w-4 h-4" />'
ok(row.includes('<ExternalLink'), 'det er ikonet')
ok(row.includes('w-4 h-4'), 'stoerrelsen bliver')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('Opret sag'), 'teksten er et andet sted')
ok(!row.includes('data-testid="mail-opret-sag-button"'), 'knappen er et andet sted')
ok(!row.includes('<button'), 'knap-tagget er et andet sted')
ok(!row.includes('onClick={onCreateServiceCase}'), 'klikket er et andet sted')
ok(!row.includes('Loader2'), 'spinneren er et andet sted')
ok(!row.includes('animate-spin'), 'spinnerklassen er et andet sted')
ok(!row.includes('bg-purple-600'), 'knapfarven er et andet sted')
ok(!row.includes('Åbn kunde'), 'kundelinket er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('Opret sag'), 'teksten bliver')
ok(view.includes('data-testid="mail-opret-sag-button"'), 'knappen bliver')
ok(view.includes('onClick={onCreateServiceCase}'), 'klikket bliver')
ok(view.includes('Åbn kunde <ExternalLink className="w-3 h-3 break-words min-w-0" data-testid="mail-kunde-arrow" />'), 'kundepilen bliver')
ok(view.includes('Se opgave <ExternalLink className="w-3 h-3" />'), 'opgavepilen bliver')
ok(view.includes('Hop til Chat <ExternalLink className="w-3 h-3" />'), 'chatpilen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')
ok(view.includes('data-testid="mail-create-offer-icon"'), 'tilbudsikonet bliver')
ok(view.includes('Opret tilbud'), 'opret-tilbud-teksten bliver')
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
console.log('PASS  mail-opret-sag-icon-wrap-test')
