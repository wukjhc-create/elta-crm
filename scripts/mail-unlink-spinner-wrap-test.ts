/**
 * Fjern-kobling-spinneren i mail-detaljen kan krympe. Teksten Fjern kobling bliver.
 * Hurtigt-svar-spinneren og indlaesningssspinneren bliver bare.
 *   npx tsx scripts/mail-unlink-spinner-wrap-test.ts
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
const id = 'data-testid="mail-unlink-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 62, at + 10) : ''
const bare = '<Loader2 className="w-3 h-3 animate-spin" />'
const cell = '<Loader2 className="w-3 h-3 animate-spin break-words min-w-0" data-testid="mail-unlink-spinner" />'
ok(row.startsWith('<Loader2'), 'det er spinneren')
ok(row.includes('break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(!row.includes('Fjern'), 'teksten er et andet sted')
ok(!row.includes('isUnlinking'), 'tilstanden er et andet sted')
ok(!row.includes('kobling'), 'koblingsteksten er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(view.split(bare).length === 2, 'indlaesnings-spinneren bliver bar')
ok(view.includes('Fjern kobling'), 'teksten bliver')
ok(view.includes('title="Fjern kobling"'), 'titlen bliver')
ok(view.includes('data-testid="mail-unlink-x"'), 'luk-ikonet bliver')
ok(view.includes('data-testid="mail-unlink-button"'), 'fjern-knappen bliver')
const unlinkAt = view.indexOf('{isUnlinking ? <Loader2')
const replyAt = view.indexOf('{isSendingReply === tpl.text ? <Loader2')
const bodyAt = view.indexOf('data-testid="mail-body-loading"')
const unlinkSlice = unlinkAt >= 0 ? view.slice(unlinkAt, unlinkAt + 160) : ''
const replySlice = replyAt >= 0 ? view.slice(replyAt, replyAt + 160) : ''
const bodySlice = bodyAt >= 0 ? view.slice(bodyAt, bodyAt + 90) : ''
ok(unlinkSlice.includes(id), 'spinneren er ved fjern kobling')
ok(!unlinkSlice.includes(bare), 'fjern-kobling-spinneren er ikke bar')
ok(!replySlice.includes(bare), 'hurtigt-svar-spinneren er ikke bar')
ok(replySlice.includes('data-testid="mail-quick-reply-spinner"'), 'hurtigt-svar-spinneren kan krympe')
ok(!replySlice.includes(id), 'fjern-kobling-spinneren er ikke ved hurtigt svar')
ok(bodySlice.includes(bare), 'indlaesnings-spinneren er stadig bar')
ok(!bodySlice.includes(id), 'fjern-kobling-spinneren er ikke ved indlaesning')
ok(view.split('{isUnlinking ? <Loader2').length === 2, 'fjern-markoeren findes en gang')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
ok(view.split('data-testid="mail-unlink-x"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-unlink-button"').length === 2, 'knap-id kolliderer ikke')
ok(view.includes('data-testid="mail-backfill-spinner"'), 'download-spinneren bliver')
ok(view.includes('data-testid="mail-quick-reply-icon"'), 'svar-ikonet bliver')
ok(view.includes('Bekræft modtagelse'), 'bekraeft bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-unlink-spinner-wrap-test')
