/**
 * Handlingsraekken i mail-detaljen kan krympe. Knapteksterne bliver.
 *   npx tsx scripts/mail-action-row-wrap-test.ts
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
const id = 'data-testid="mail-action-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 10) : ''
const cell = 'className="flex items-center gap-2 pt-2 flex-wrap break-words min-w-0" data-testid="mail-action-row"'
const bare = 'className="flex items-center gap-2 pt-2 flex-wrap"'
ok(row.includes('<div'), 'det er raekken')
ok(row.includes('pt-2 flex-wrap'), 'afstanden bliver')
ok(row.includes('break-words min-w-0'), 'raekken kan krympe')
ok(!row.includes('ACTION BUTTONS'), 'kommentaren er et andet sted')
ok(!row.includes('mail-kobl-button'), 'kobl-knappen er et andet sted')
ok(!row.includes('link_status'), 'betingelsen er et andet sted')
ok(!row.includes('mail-portal-frame'), 'portalrammen er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare raekkeklasse er vaek')
ok(view.includes('Kobl til eksisterende'), 'kobl-teksten bliver')
ok(view.includes('Opret som ny kunde'), 'opret-kunde-teksten bliver')
ok(view.includes('Opret sag'), 'opret-sag-teksten bliver')
ok(view.includes('onClick={onCreateServiceCase}'), 'opret-sag-klikket bliver')
ok(view.includes('data-testid="mail-kobl-button"'), 'kobl-knappen bliver')
ok(view.includes('data-testid="mail-opret-kunde-button"'), 'opret-kunde-knappen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')
ok(view.includes('data-testid="mail-kobl-icon"'), 'kobl-ikonet bliver')
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
console.log('PASS  mail-action-row-wrap-test')
