/**
 * Den faerdige mail-raekke kan krympe. Teksten Mail opdateret bliver.
 * Raekken ved nye mails roeres ikke.
 *   npx tsx scripts/mail-freshness-done-wrap-test.ts
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
const id = 'data-testid="mail-freshness">Mail opdateret'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 12) : ''
const bare = '<span className="text-xs text-gray-500" data-testid="mail-freshness">'
const cell = '<span className="text-xs text-gray-500 break-words min-w-0" data-testid="mail-freshness">'
const syncing = '<span className="text-xs text-gray-500 inline-flex items-center gap-1 break-words min-w-0" data-testid="mail-freshness">'
ok(row.startsWith('<span'), 'det er raekken')
ok(row.includes('break-words min-w-0'), 'raekken kan krympe')
ok(row.includes('text-xs text-gray-500'), 'tekstklassen bliver')
ok(!row.includes('Mail'), 'teksten er et andet sted')
ok(!row.includes('Henter'), 'indlaesningsteksten er et andet sted')
ok(!row.includes('Loader2'), 'spinneren er et andet sted')
ok(!row.includes('inline-flex'), 'synkeraekken er et andet sted')
ok(!row.includes('return'), 'return er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(!row.includes('\r'), 'vognretur er et andet sted')
ok(view.split(cell).length === 2, 'raekken findes en gang')
ok(view.split(bare).length === 1, 'den bare raekke er vaek')
ok(view.split(syncing).length === 2, 'synkeraekken bliver')
ok(view.split(id).length === 2, 'faerdig-markoeren findes en gang')
ok(view.includes('Mail opdateret'), 'teksten bliver')
ok(view.includes("Mail opdateret{inserted > 0 ? ` · ${inserted} nye` : ''}"), 'antallet bliver')
ok(view.includes('Henter nye mails…'), 'indlaesningsteksten bliver')
ok(view.includes('data-testid="mail-freshness-spinner"'), 'spinneren bliver')
ok(view.includes('syncMailIfStaleAction()'), 'synken bliver')
ok(!view.includes('formatCurrency('), 'ingen opfundet pris')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-freshness-done-wrap-test')
