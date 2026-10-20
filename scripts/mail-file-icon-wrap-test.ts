/**
 * Filikonet i mailens vedhaeftningsliste kan krympe.
 * Lead-detaljen, filnavnet og download bliver.
 *   npx tsx scripts/mail-file-icon-wrap-test.ts
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

const wrapped = '<Icon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 shrink-0 break-words min-w-0" />'
const bare = '<Icon className="w-5 h-5 text-gray-400 group-hover:text-blue-500 shrink-0" />'
const mail = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')
const lead = readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')

ok(mail.includes(wrapped), 'filikonet kan krympe')
ok(mail.split(wrapped).length === 2, 'filikonet er et')
ok(!mail.includes(bare), 'mail-ikonet er ikke bart')
ok(mail.includes('shrink-0 break-words min-w-0'), 'shrink-0 bliver')
ok(mail.includes('data-testid="mail-file-name"'), 'filnavnet bliver')
ok(mail.includes('<Download className="w-4 h-4 text-gray-300 group-hover:text-blue-500 shrink-0 break-words min-w-0" />'), 'download-ikonet ombrydes')
ok(lead.includes(wrapped), 'lead-ikonet kan krympe')
ok(!lead.includes(bare), 'lead-ikonet er ikke bart')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-file-icon-wrap-test')
