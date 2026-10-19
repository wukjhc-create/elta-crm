/**
 * Indlaesnings-spinneren ved nye mails kan krympe. Teksten Henter nye mails bliver.
 *   npx tsx scripts/mail-freshness-spinner-wrap-test.ts
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

const view = readFileSync('src/components/dashboard/mail-freshness-sync.tsx', 'utf8')
const id = 'data-testid="mail-freshness-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 62, at + 10) : ''
const bare = '<Loader2 className="w-3 h-3 animate-spin" />'
const cell = '<Loader2 className="w-3 h-3 animate-spin break-words min-w-0" data-testid="mail-freshness-spinner" />'
const marker = 'data-testid="mail-freshness"><Loader2'
const span = '<span className="text-xs text-gray-500 inline-flex items-center gap-1" data-testid="mail-freshness">'
ok(row.startsWith('<Loader2'), 'det er spinneren')
ok(row.includes('break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(!row.includes('Henter'), 'teksten er et andet sted')
ok(!row.includes('Mail opdateret'), 'faerdig-teksten er et andet sted')
ok(!row.includes('syncMailIfStaleAction'), 'synken er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare spinner er vaek')
ok(view.split(marker).length === 2, 'indlaesnings-markoeren findes en gang')
ok(view.split(span).length === 2, 'raekken bliver')
ok(view.includes('Henter nye mails…'), 'teksten bliver')
ok(view.includes('data-testid="mail-freshness">Mail opdateret'), 'faerdig-tilstanden bliver')
ok(view.includes('syncMailIfStaleAction()'), 'synken bliver')
ok(view.includes('router.refresh()'), 'opdateringen bliver')
const freshAt = view.indexOf('data-testid="mail-freshness"')
const back = freshAt >= 0 ? view.slice(freshAt - 100, freshAt + 10) : ''
ok(!back.includes('Loader2'), 'tilbageblikket rammer ikke spinneren')
ok(!back.includes('Henter'), 'tilbageblikket rammer ikke teksten')
ok(back.includes('inline-flex items-center gap-1'), 'raekkens klasse bliver')
const fwd = freshAt >= 0 ? view.slice(freshAt, freshAt + 160) : ''
ok(fwd.includes(id), 'spinneren er ved nye mails')
ok(!fwd.includes(bare), 'spinneren er ikke bar')
ok(fwd.includes('Henter nye mails…'), 'teksten ligger paa raekken')
ok(!fwd.includes('Mail opdateret'), 'faerdig-teksten er et andet sted')
const ids = [...view.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1])
const collisions = [...new Set(ids)].filter((name) => {
  const q = `data-testid="${name}"`
  return q !== id && (q.startsWith(id) || id.startsWith(q))
})
ok(collisions.length === 0, 'testid kolliderer ikke')
ok(view.split('data-testid="mail-freshness"').length === 3, 'raekke-id findes to gange')
ok(!view.includes('formatCurrency('), 'ingen opfundet pris')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-freshness-spinner-wrap-test')
