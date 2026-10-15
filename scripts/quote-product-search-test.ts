/** Produktsogning i mail-tilbud siger naar soegningen fejler. Tom tekst og priser bliver. Koer: npx tsx scripts/quote-product-search-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/offers.ts', 'utf8')
const live = action.slice(action.indexOf('export async function searchSupplierProductsLive'), action.indexOf('export async function', action.indexOf('export async function searchSupplierProductsLive') + 10))
eq('fallback-fejl er en fejl', live.split("return { success: false, error: fallback.error || 'Kunne ikke søge produkter' }").length === 3, true)
eq('tilladelse bliver', live.includes("return { success: false, error: 'Manglende tilladelse: offers.view' }"), true)
eq('kort soegning bliver tom', live.includes('if (!sanitized || sanitized.length < 2)') && live.includes('return { success: true, data: [] }'), true)

const view = fs.readFileSync('src/app/dashboard/mail/components/quote-line-items-editor.tsx', 'utf8')
eq('fejl siger det', view.includes('data-testid="quote-product-search-error"') && view.includes('Det tælles ikke som ingen produkter.'), true)
eq('tom api bliver', view.includes('Ingen produkter fundet via API'), true)
eq('tom lokal bliver', view.includes('Ingen produkter fundet'), true)
eq('linjetotal bliver', view.includes('const lineTotal = item.quantity * item.unitPrice'), true)
eq('netto bliver', view.includes('Netto: ${formatCurrency(item.costPrice'), true)

console.log(fail ? `\n${fail} fejl` : '\nquote-product-search-test OK')
process.exitCode = fail ? 1 : 0
