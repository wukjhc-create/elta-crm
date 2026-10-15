/** Tilbudsmailens linjer og totaler ombrydes. Formler, rabattegn og accent-klasse bliver. Koer: npx tsx scripts/quote-preview-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/mail/components/quote-form-dialog.tsx', 'utf8')
const start = src.indexOf('LINJER')
const end = src.indexOf('Sendes af', start)
const block = src.slice(start, end)
eq('previewet findes', start > 0 && end > start, true)
eq('linje ombrydes', block.includes('min-w-0 break-words">{formatCurrency(li.quantity * li.unitPrice, \'DKK\', 2)}'), true)
eq('beskrivelse ombrydes', block.includes('text-gray-700 min-w-0 break-words">{li.description}'), true)
eq('subtotal ombrydes', block.includes('min-w-0 break-words">{formatCurrency(subtotal, \'DKK\', 2)}'), true)
eq('rabattegn bliver', block.includes('-{formatCurrency(discountAmount, \'DKK\', 2)}'), true)
eq('moms ombrydes', block.includes('min-w-0 break-words">{formatCurrency(taxAmount, \'DKK\', 2)}'), true)
eq('total ombrydes', block.includes('min-w-0 break-words text-${accentColor}-600'), true)
eq('accent-kant bliver', block.includes('border-${accentColor}-500'), true)
eq('subtotal-formel bliver', src.includes('lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)'), true)
eq('rabat-formel bliver', src.includes('subtotal * (discountPercentage / 100)'), true)
eq('moms-formel bliver', src.includes('afterDiscount * (taxPercentage / 100)'), true)
eq('total-formel bliver', src.includes('const total = afterDiscount + taxAmount'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nquote-preview-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
