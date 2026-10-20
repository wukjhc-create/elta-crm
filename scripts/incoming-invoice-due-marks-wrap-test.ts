/**
 * Forfaldsmaerkets kolonne paa fakturalisten kan krympe. Datoen bliver.
 *   npx tsx scripts/incoming-invoice-due-marks-wrap-test.ts
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

const view = readFileSync('src/app/dashboard/incoming-invoices/list-client.tsx', 'utf8')
const wrapped = 'className="inline-flex flex-col gap-0.5 break-words min-w-0"'
const bare = 'className="inline-flex flex-col gap-0.5"'
const marker = '<span>{withLabel ? `Forfald ${fmtDate(dueDate)}` : fmtDate(dueDate)}</span>'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt + wrapped.length, classAt + wrapped.length + 220)
ok(view.split(wrapped).length === 2, 'forfaldskolonnen kan krympe')
ok(after.replace(/^\s+/, '').startsWith('>') && after.includes(marker), 'datoen i forfald bliver')
ok(view.split(bare).length === 1, 'den bare forfaldskolonne er vaek')
ok(!view.includes(bare), 'den bare forfaldskolonne er vaek')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-due-marks-wrap-test')
