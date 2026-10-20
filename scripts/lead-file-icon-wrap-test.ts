/**
 * Filikonet paa lead-detaljen kan krympe.
 * Mail-detaljen, filnavnet og download bliver. shrink-0 bliver.
 *   npx tsx scripts/lead-file-icon-wrap-test.ts
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
const lead = readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')
const mail = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')

ok(lead.includes(wrapped), 'filikonet kan krympe')
ok(lead.split(wrapped).length === 2, 'filikonet er et')
ok(!lead.includes(bare), 'filikonet er ikke bart')
ok(lead.includes('shrink-0 break-words min-w-0'), 'shrink-0 bliver')
ok(lead.includes('{att.filename}'), 'filnavnet bliver')
ok(lead.includes('<Download className="w-4 h-4 text-gray-300 group-hover:text-blue-500 shrink-0 break-words min-w-0" />'), 'download-ikonet kan krympe')
ok(mail.includes(wrapped), 'mail-ikonet bliver')
ok(mail.split(wrapped).length === 2, 'mail-ikonet er et')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  lead-file-icon-wrap-test')
