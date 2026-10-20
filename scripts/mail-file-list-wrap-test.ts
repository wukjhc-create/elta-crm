/**
 * Listen med mailens filer kan krympe. Filnavn og stoerrelse bliver.
 *   npx tsx scripts/mail-file-list-wrap-test.ts
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

const wrapped = '<div className="space-y-1.5 break-words min-w-0">'
const bare = '<div className="space-y-1.5">'
const mail = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')

ok(mail.includes(wrapped), 'fillisten kan krympe')
ok(mail.split(wrapped).length === 2, 'fillisten er en')
ok(!mail.includes(bare), 'fillisten er ikke bar')
ok(mail.includes('data-testid="mail-file-name"'), 'filnavnet bliver')
ok(mail.includes('data-testid="mail-list-size"'), 'filstoerrelsen bliver')
ok(mail.includes('data-testid="mail-reply-stack"'), 'svarstakken bliver')
ok(mail.includes('<div className="space-y-1 break-words min-w-0" data-testid="mail-reply-stack">'), 'svarstakken er stadig ombrudt')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-file-list-wrap-test')
