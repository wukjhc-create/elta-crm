/**
 * Svaret ved sagsvaelgeren kan krympe. Feedback-teksten bliver.
 *   npx tsx scripts/mail-case-feedback-wrap-test.ts
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
const id = 'data-testid="mail-case-feedback"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 10) : ''
const cell = 'className={`text-xs ${feedback.startsWith(\'Fejl\') ? \'text-red-600\' : \'text-green-700\'} break-words min-w-0`} data-testid="mail-case-feedback"'
const bare = 'className={`text-xs ${feedback.startsWith(\'Fejl\') ? \'text-red-600\' : \'text-green-700\'}`}'
ok(row.includes('<span'), 'det er spanet')
ok(row.includes('className'), 'klassen er paa spanet')
ok(row.includes('break-words min-w-0'), 'svaret kan krympe')
ok(row.includes('text-red-600'), 'fejlfarven bliver')
ok(row.includes('text-green-700'), 'ok-farven bliver')
ok(row.includes('Fejl'), 'fejlordet bliver')
ok(!row.includes('{feedback}'), 'teksten er et andet sted')
ok(!row.includes('mail-case-saving'), 'spinneren er et andet sted')
ok(!row.includes('mail-case-actions'), 'handlingsraekken er et andet sted')
ok(!row.includes('isSaving'), 'gem-betingelsen er et andet sted')
ok(!row.includes('Vælg'), 'vaelg sag er et andet sted')
ok(!row.includes('truncate'), 'vaelgeren er et andet sted')
ok(!row.includes('mail-no-cases'), 'ingen-sager er et andet sted')
ok(!row.includes('return'), 'return er et andet sted')
ok(!row.includes('mail-agent-result'), 'mailagenten er et andet sted')
ok(!row.includes('backfillMsg'), 'download-svaret er et andet sted')
ok(view.split(id).length === 2, 'svaret findes en gang')
ok(view.split(cell).length === 2, 'svarklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare svarklasse er vaek')
ok(view.split('{feedback}').length === 2, 'teksten bliver')
ok(view.split('feedback.startsWith(\'Fejl\')').length === 2, 'betingelsen bliver')
ok(view.split('data-testid="mail-case-saving"').length === 2, 'spinner-id kolliderer ikke')
ok(view.split('data-testid="mail-case-actions"').length === 2, 'handlings-id kolliderer ikke')
ok(view.split('data-testid="mail-case-link"').length === 2, 'link-id kolliderer ikke')
ok(view.split('data-testid="mail-no-cases"').length === 2, 'ingen-sager-id kolliderer ikke')
ok(view.split('data-testid="mail-case-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-case-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-case-picker-load-error"').length === 3, 'fejl-id kolliderer ikke')
ok(view.includes('title="Vælg sag"'), 'titlen bliver')
ok(view.includes('max-w-[280px] truncate'), 'vaelgeren bliver klippet')
ok(view.includes('className="text-gray-600">Ingen sag tilknyttet'), 'ingen sag bliver')
ok(view.includes('{isSaving && <Loader2'), 'spinneren bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('{backfillMsg}'), 'download-svaret bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-case-feedback-wrap-test')
