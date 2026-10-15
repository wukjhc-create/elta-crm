/** Kundens tidligere tilbud siger naar hentningen fejler. Tom historik bliver. Koer: npx tsx scripts/quote-history-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/quote-actions.ts', 'utf8')
const fn = src.slice(src.indexOf('export async function getCustomerQuoteHistory'), src.indexOf('export async function', src.indexOf('export async function getCustomerQuoteHistory') + 10))
eq('tilbudsfejl', fn.includes("if (error) return { success: false, error: 'Kunne ikke hente kundehistorik' }"), true)
eq('tom historik bliver', fn.includes('return { success: true, data: { totalOffers: 0 } }'), true)
eq('linjefejl', fn.includes('if (lineError) return { success: false, error: \'Kunne ikke hente kundehistorik\' }'), true)
eq('antalfejl', fn.includes('if (countError) return { success: false, error: \'Kunne ikke hente kundehistorik\' }'), true)
eq('aekte nul', fn.includes('totalOffers: count ?? 0'), true)
eq('sender ikke', fn.includes('sendQuote') === false, true)

const view = fs.readFileSync('src/app/dashboard/mail/components/quote-form-dialog.tsx', 'utf8')
eq('fejltekst', view.includes('data-testid="quote-history-load-error"') && view.includes('Det tælles ikke som ingen tidligere tilbud.'), true)
eq('udfylder stadig', view.includes('setLineItems(res.data.lastLineItems)'), true)

console.log(fail ? `\n${fail} fejl` : '\nquote-history-load-test OK')
process.exitCode = fail ? 1 : 0
