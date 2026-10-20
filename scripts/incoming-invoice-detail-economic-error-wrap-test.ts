/**
 * Rammen om e-conomic-fejl paa fakturadetaljen kan krympe.
 * Fejlteksten og data-testid bliver.
 *   npx tsx scripts/incoming-invoice-detail-economic-error-wrap-test.ts
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
const wrapped = 'className="rounded-md ring-1 ring-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 break-words min-w-0"'
const bare = 'className="rounded-md ring-1 ring-red-300 bg-red-50 px-3 py-2 text-xs text-red-800"'
const classAt = view.indexOf(wrapped)
const after = classAt < 0 ? '' : view.slice(classAt, classAt + 320)
ok(view.split(wrapped).length === 2, 'rammen kan krympe')
ok(after.includes('data-testid="economic-ready-load-error"'), 'testid bliver')
ok(after.includes('Det tælles ikke som at e-conomic mangler.'), 'teksten bliver')
ok(after.includes('Bogføring er deaktiveret.'), 'forklaringen bliver')
ok(view.split(bare).length === 1, 'den bare ramme er vaek')
ok(!view.includes(bare), 'den bare ramme er vaek')
ok(view.includes('className="rounded-md ring-1 ring-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 break-words min-w-0"'), 'opsaetningsrammen bliver')
ok(view.includes('className="border-amber-300 text-amber-900 hover:bg-amber-50"'), 'sletteknappen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  incoming-invoice-detail-economic-error-wrap-test')
