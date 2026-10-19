/**
 * Hurtigt-svar-spinneren i mail-detaljen kan krympe. Knapteksterne bliver.
 * Indlaesnings-spinneren kan krympe.
 *   npx tsx scripts/mail-quick-reply-spinner-wrap-test.ts
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
const id = 'data-testid="mail-quick-reply-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 62, at + 10) : ''
const bare = '<Loader2 className="w-3 h-3 animate-spin" />'
const cell = '<Loader2 className="w-3 h-3 animate-spin break-words min-w-0" data-testid="mail-quick-reply-spinner" />'
ok(row.startsWith('<Loader2'), 'det er spinneren')
ok(row.includes('break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(!row.includes('Bekr'), 'teksten er et andet sted')
ok(!row.includes('isSendingReply'), 'tilstanden er et andet sted')
ok(!row.includes('tpl'), 'skabelonen er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare spinner er vaek')
ok(view.includes('Bekræft modtagelse'), 'bekraeft bliver')
ok(view.includes('Mangler info'), 'mangler-info bliver')
ok(view.includes('Tak for ordren'), 'tak-for-ordren bliver')
ok(view.includes('data-testid="mail-quick-reply-icon"'), 'svar-ikonet bliver')
ok(view.includes('data-testid="mail-quick-reply-button"'), 'svar-knappen bliver')
const replyAt = view.indexOf('{isSendingReply === tpl.text ? <Loader2')
const bodyAt = view.indexOf('data-testid="mail-body-loading"')
const unlinkAt = view.indexOf('data-testid="mail-unlink-spinner"')
const replySlice = replyAt >= 0 ? view.slice(replyAt, replyAt + 160) : ''
const bodySlice = bodyAt >= 0 ? view.slice(bodyAt, bodyAt + 160) : ''
const unlinkSlice = unlinkAt >= 0 ? view.slice(Math.max(0, unlinkAt - 80), unlinkAt + 40) : ''
ok(replySlice.includes(id), 'spinneren er ved hurtigt svar')
ok(!replySlice.includes(bare), 'hurtigt-svar-spinneren er ikke bar')
ok(!bodySlice.includes(bare), 'indlaesnings-spinneren er ikke bar')
ok(bodySlice.includes('data-testid="mail-body-loading-spinner"'), 'indlaesnings-spinneren kan krympe')
ok(!bodySlice.includes(id), 'hurtigt-svar-spinneren er ikke ved indlaesning')
ok(unlinkSlice.includes('data-testid="mail-unlink-spinner"'), 'fjern-kobling-spinneren bliver')
ok(!unlinkSlice.includes(bare), 'fjern-kobling-spinneren er ikke bar')
ok(!unlinkSlice.includes(id), 'hurtigt-svar-spinneren er ikke ved fjern kobling')
ok(view.split('{isSendingReply === tpl.text ? <Loader2').length === 2, 'svar-markoeren findes en gang')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
ok(view.split('data-testid="mail-quick-reply-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-quick-reply-button"').length === 2, 'knap-id kolliderer ikke')
ok(view.includes('>Hurtigt svar</p>'), 'overskriften bliver')
ok(view.includes('Henter hele mailen…'), 'indlaesningsteksten bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-quick-reply-spinner-wrap-test')
