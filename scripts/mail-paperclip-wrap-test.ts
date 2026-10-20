/**
 * Papirclipsen ved Vedhaeftede filer kan krympe. Overskriften bliver.
 *   npx tsx scripts/mail-paperclip-wrap-test.ts
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

const wrapped = '<Paperclip className="w-5 h-5 text-gray-500 break-words min-w-0" />'
const bare = '<Paperclip className="w-5 h-5 text-gray-500" />'
const mail = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')
const lead = readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')

ok(mail.includes(wrapped), 'papirclipsen kan krympe')
ok(mail.split(wrapped).length === 2, 'papirclipsen er en')
ok(!mail.includes(bare), 'papirclipsen er ikke bar')
ok(mail.includes('data-testid="mail-attachments-heading"'), 'overskriften bliver')
ok(mail.includes('Vedhæftede filer'), 'overskriftsteksten bliver')
ok(lead.includes(bare), 'lead-clipsen bliver')
ok(!lead.includes(wrapped), 'lead-clipsen er ikke mailens')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-paperclip-wrap-test')
