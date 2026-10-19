/**
 * Opret-sag-spinneren i mail-detaljen kan krympe. Teksten Opret sag bliver.
 * Download-spinneren bliver bar.
 *   npx tsx scripts/mail-opret-sag-spinner-wrap-test.ts
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
const id = 'data-testid="mail-opret-sag-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 62, at + 10) : ''
const bare = '<Loader2 className="w-4 h-4 animate-spin" />'
const cell = '<Loader2 className="w-4 h-4 animate-spin break-words min-w-0" data-testid="mail-opret-sag-spinner" />'
ok(row.startsWith('<Loader2'), 'det er spinneren')
ok(row.includes('break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(!row.includes('Opret'), 'teksten er et andet sted')
ok(!row.includes('isCreating'), 'tilstanden er et andet sted')
ok(!row.includes('External'), 'ikonet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(view.split(bare).length === 2, 'download-spinneren bliver bar')
ok(view.includes('Opret sag'), 'teksten bliver')
ok(view.includes('data-testid="mail-opret-sag-icon"'), 'opret-sag-ikonet bliver')
ok(view.includes('data-testid="mail-opret-sag-button"'), 'opret-sag-knappen bliver')
const sagAt = view.indexOf('{isCreatingServiceCase ? <Loader2')
const backfillAt = view.indexOf('{isBackfilling ? <Loader2')
const sagSlice = sagAt >= 0 ? view.slice(sagAt, sagAt + 140) : ''
const backfillSlice = backfillAt >= 0 ? view.slice(backfillAt, backfillAt + 90) : ''
ok(sagSlice.includes(id), 'spinneren er ved opret sag')
ok(!sagSlice.includes(bare), 'opret-sag-spinneren er ikke bar')
ok(backfillSlice.includes(bare), 'download-spinneren er stadig bar')
ok(!backfillSlice.includes(id), 'opret-sag-spinneren er ikke ved download')
ok(view.split('{isCreatingServiceCase ? <Loader2').length === 2, 'opret-sag-markoeren findes en gang')
ok(view.split('{isBackfilling ? <Loader2').length === 2, 'download-markoeren findes en gang')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
ok(view.split('data-testid="mail-opret-sag-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-opret-sag-button"').length === 2, 'knap-id kolliderer ikke')
ok(view.includes('data-testid="mail-agent-spinner"'), 'mailagent-spinneren bliver')
ok(view.includes('data-testid="mail-ignore-spinner"'), 'ignorer-spinneren bliver')
ok(view.includes('data-testid="mail-restore-spinner"'), 'relevant-spinneren bliver')
ok(view.includes('data-testid="mail-archive-spinner"'), 'arkiv-spinneren bliver')
ok(view.includes('data-testid="mail-pending-dl-icon"'), 'download-ikonet bliver')
ok(view.includes('Download vedhæftninger nu'), 'download-teksten bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-opret-sag-spinner-wrap-test')
