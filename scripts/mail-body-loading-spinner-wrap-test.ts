/**
 * Indlaesnings-spinneren i mail-detaljen kan krympe. Teksten Henter hele mailen bliver.
 * De andre spinner-ikoner bliver.
 *   npx tsx scripts/mail-body-loading-spinner-wrap-test.ts
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
const id = 'data-testid="mail-body-loading-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 62, at + 10) : ''
const bare = '<Loader2 className="w-3 h-3 animate-spin" />'
const cell = '<Loader2 className="w-3 h-3 animate-spin break-words min-w-0" data-testid="mail-body-loading-spinner" />'
const marker = 'data-testid="mail-body-loading"><Loader2'
ok(row.startsWith('<Loader2'), 'det er spinneren')
ok(row.includes('break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(!row.includes('Henter'), 'teksten er et andet sted')
ok(!row.includes('mail-body-plain'), 'broedteksten er et andet sted')
ok(!row.includes('mail-body-html'), 'html-teksten er et andet sted')
ok(!row.includes('isSendingReply'), 'hurtigt svar er et andet sted')
ok(!row.includes('isUnlinking'), 'fjern kobling er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare spinner er vaek')
ok(view.split(marker).length === 2, 'indlaesnings-markoeren findes en gang')
ok(view.includes('Henter hele mailen…'), 'teksten bliver')
const bodyAt = view.indexOf('data-testid="mail-body-loading"')
const para = bodyAt >= 0 ? view.slice(bodyAt - 100, bodyAt + 10) : ''
ok(!para.includes('Loader2'), 'afsnittets tilbageblik rammer ikke spinneren')
ok(!para.includes('Henter'), 'afsnittets tilbageblik rammer ikke teksten')
const bodySlice = bodyAt >= 0 ? view.slice(bodyAt, bodyAt + 160) : ''
ok(bodySlice.includes(id), 'spinneren er ved indlaesningen')
ok(!bodySlice.includes(bare), 'indlaesnings-spinneren er ikke bar')
const replyAt = view.indexOf('{isSendingReply === tpl.text ? <Loader2')
const unlinkAt = view.indexOf('{isUnlinking ? <Loader2')
const replySlice = replyAt >= 0 ? view.slice(replyAt, replyAt + 160) : ''
const unlinkSlice = unlinkAt >= 0 ? view.slice(unlinkAt, unlinkAt + 160) : ''
ok(replySlice.includes('data-testid="mail-quick-reply-spinner"'), 'hurtigt-svar-spinneren bliver')
ok(!replySlice.includes(bare), 'hurtigt-svar-spinneren er ikke bar')
ok(!replySlice.includes(id), 'indlaesnings-spinneren er ikke ved hurtigt svar')
ok(unlinkSlice.includes('data-testid="mail-unlink-spinner"'), 'fjern-kobling-spinneren bliver')
ok(!unlinkSlice.includes(bare), 'fjern-kobling-spinneren er ikke bar')
ok(!unlinkSlice.includes(id), 'indlaesnings-spinneren er ikke ved fjern kobling')
const iconAt = view.indexOf('data-testid="mail-quick-reply-icon"')
const iconSlice = iconAt >= 0 ? view.slice(iconAt - 60, iconAt + 10) : ''
ok(!iconSlice.includes('Loader2'), 'svar-ikonet er ikke spinneren')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
ok(view.split('data-testid="mail-body-loading"').length === 2, 'indlaesnings-id kolliderer ikke')
ok(view.includes('data-testid="mail-quick-reply-spinner"'), 'hurtigt-svar-spinneren bliver i filen')
ok(view.includes('data-testid="mail-unlink-spinner"'), 'fjern-kobling-spinneren bliver i filen')
ok(view.includes('data-testid="mail-opret-sag-spinner"'), 'opret-sag-spinneren bliver')
ok(view.includes('data-testid="mail-backfill-spinner"'), 'download-spinneren bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')
ok(view.includes('className="text-xs text-gray-400 mb-2 flex items-center gap-1 break-words min-w-0" data-testid="mail-body-loading"'), 'afsnittet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-body-loading-spinner-wrap-test')
