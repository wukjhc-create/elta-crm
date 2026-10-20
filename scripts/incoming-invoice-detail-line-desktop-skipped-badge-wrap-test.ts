/**
 * Maerket Sprunget over paa fakturalinjens skrivebord kan krympe.
 * Teksten er uaendret. Mailindstillingerne er uaendrede.
 *   npx tsx scripts/incoming-invoice-detail-line-desktop-skipped-badge-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/[id]/detail-client.tsx', 'utf8')
const wrapped = '<span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded break-words min-w-0">'
const bare = '<span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">'
ok(view.includes(wrapped), 'sprunget-over kan krympe')
ok(!view.includes(bare), 'det bare sprunget-over er vaek')
ok(view.split(wrapped).length === 2, 'sprunget-over er et')
ok(view.includes('Sprunget over'), 'teksten bliver')
ok(!view.includes('break-words break-words'), 'et break-words')

const ikke = '<span className="text-[10px] text-gray-500 break-words min-w-0">Ikke konverteret</span>'
ok(view.includes(ikke), 'ikke-konverteret bliver')
ok(view.split(ikke).length === 2, 'ikke-konverteret er et')

const mailSettings = readFileSync('src/app/dashboard/settings/invoice-email/invoice-email-settings-client.tsx', 'utf8')
ok(mailSettings.includes(bare), 'mailindstillingerne bliver')
ok(!mailSettings.includes(wrapped), 'mailindstillingerne er ikke pakket')

const other = readFileSync('src/app/dashboard/orders/[id]/order-other-costs-tab.tsx', 'utf8')
ok(!other.includes(wrapped), 'ovrige omkostninger er ikke pakket')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-line-desktop-skipped-badge-wrap-test')
