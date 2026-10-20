/**
 * Billedgitteret i mailen kan krympe. Filnavnets line-clamp-2 bliver.
 *   npx tsx scripts/mail-gallery-grid-wrap-test.ts
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

const wrapped = '<div className="grid grid-cols-3 gap-2 break-words min-w-0">'
const bare = '<div className="grid grid-cols-3 gap-2">'
const mail = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')

ok(mail.includes(wrapped), 'billedgitteret kan krympe')
ok(mail.split(wrapped).length === 2, 'billedgitteret er et')
ok(!mail.includes(bare), 'billedgitteret er ikke bart')
ok(mail.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(mail.includes('data-testid="mail-gallery-image-button"'), 'billedknappen bliver')
ok(mail.includes('data-testid="mail-gallery-size"'), 'billedteksten bliver')
ok(mail.includes('data-testid="mail-attachments-stack"'), 'stakken bliver')

const dialog = readFileSync('src/components/mail/create-from-mail-dialog.tsx', 'utf8')
const rooms = readFileSync('src/app/dashboard/calculations/room-calculator/room-calculator-client.tsx', 'utf8')
ok(dialog.includes(bare), 'opret-fra-mail-gitteret bliver')
ok(rooms.includes(bare), 'rumkalkulatorens gitter bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-gallery-grid-wrap-test')
