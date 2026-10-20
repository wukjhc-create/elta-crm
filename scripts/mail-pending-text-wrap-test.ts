/**
 * Teksten om manglende vedhaeftninger kan krympe. Download-knappen bliver.
 *   npx tsx scripts/mail-pending-text-wrap-test.ts
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

const wrapped = '<p className="text-sm text-amber-800 break-words min-w-0">'
const bare = '<p className="text-sm text-amber-800">'
const mail = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')

ok(mail.includes(wrapped), 'venteteksten kan krympe')
ok(mail.split(wrapped).length === 2, 'venteteksten er en')
ok(!mail.includes(bare), 'venteteksten er ikke bar')
ok(mail.includes('Vedhæftningerne er ikke downloadet endnu.'), 'saetningen bliver')
ok(mail.includes('data-testid="mail-attachments-download-button"'), 'download-knappen bliver')
ok(mail.includes('data-testid="mail-attachments-pending-box"'), 'boksen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-pending-text-wrap-test')
