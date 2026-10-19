/**
 * Raekken ved nye mails kan krympe. Teksten Henter nye mails bliver.
 * Den faerdige tilstand roeres ikke.
 *   npx tsx scripts/mail-freshness-row-wrap-test.ts
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
const id = 'data-testid="mail-freshness"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 91, at + 10) : ''
const bare = '<span className="text-xs text-gray-500 inline-flex items-center gap-1" data-testid="mail-freshness">'
const cell = '<span className="text-xs text-gray-500 inline-flex items-center gap-1 break-words min-w-0" data-testid="mail-freshness">'
const done = '<span className="text-xs text-gray-500" data-testid="mail-freshness">'
ok(row.startsWith('<span'), 'det er raekken')
ok(row.includes('break-words min-w-0'), 'raekken kan krympe')
ok(row.includes('inline-flex items-center gap-1'), 'raekken bliver en raekke')
ok(!row.includes('Henter'), 'teksten er et andet sted')
ok(!row.includes('Loader2'), 'spinneren er et andet sted')
ok(!row.includes('Mail opdateret'), 'faerdig-teksten er et andet sted')
ok(!row.includes('return'), 'return er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(cell).length === 2, 'raekken findes en gang')
ok(view.split(bare).length === 1, 'den bare raekke er vaek')
ok(view.split(done).length === 2, 'faerdig-raekken bliver')
ok(view.includes('Henter nye mails…'), 'teksten bliver')
ok(view.includes('data-testid="mail-freshness">Mail opdateret'), 'faerdig-teksten bliver')
ok(view.includes('data-testid="mail-freshness-spinner"'), 'spinneren bliver')
ok(view.includes('syncMailIfStaleAction()'), 'synken bliver')
const back = at >= 0 ? view.slice(at - 100, at + 10) : ''
ok(back.includes('inline-flex items-center gap-1'), 'tilbageblikket ser raekken')
ok(!back.includes('Loader2'), 'tilbageblikket rammer ikke spinneren')
ok(!back.includes('Henter'), 'tilbageblikket rammer ikke teksten')
const fwd = at >= 0 ? view.slice(at, at + 160) : ''
ok(fwd.includes('data-testid="mail-freshness-spinner"'), 'spinneren er ved raekken')
ok(fwd.includes('Henter nye mails…'), 'teksten ligger paa raekken')
ok(!fwd.includes('Mail opdateret'), 'faerdig-teksten er et andet sted')
ok(view.split(id).length === 3, 'raekke-id findes to gange')
ok(!view.includes('formatCurrency('), 'ingen opfundet pris')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-freshness-row-wrap-test')
