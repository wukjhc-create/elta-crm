/** Betalingsforhåndsvisningen siger naar faktura, indstillinger eller registrering ikke kan hentes. Et aegte ikke-fundet og en aegte manglende opsætning bliver. Der sendes ikke. Koer: npx tsx scripts/payment-preview-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/services/economic-client.ts', 'utf8')
const start = src.indexOf('export async function previewPaymentForEconomic')
const end = src.indexOf('export async function markInvoicePaidInEconomic')
const fn = src.slice(start, end)
eq('funktion fundet', start > 0 && end > start, true)
eq('fakturafejl foer ikke-fundet', fn.indexOf('if (invRes.error)') < fn.indexOf("error: 'Faktura ikke fundet'"), true)
eq('fakturafejl', fn.includes("error: 'Kunne ikke hente fakturaen. Det tælles ikke som at fakturaen mangler.'"), true)
eq('tjek-fejl', fn.includes("settingsRes.error ? 'Kunne ikke tjekke e-conomic' : null"), true)
eq('betaling-fejl', fn.includes("paidRes.error ? 'Kunne ikke tjekke om betalingen allerede er registreret' : null"), true)
eq('aegte opsat bliver', fn.includes('!!cfg.cashbookNumber && !!cfg.bankContraAccountNumber'), true)
eq('intet sendes', !fn.includes('sendEmail') && !fn.includes('markInvoicePaidInEconomic('), true)

const view = fs.readFileSync('src/components/modules/invoices/invoice-payment-economic-preview.tsx', 'utf8')
eq('liste-banner', view.includes('data-testid="economic-payment-load-error"'), true)
eq('tjek-banner', view.includes('data-testid="economic-payment-ready-error"') && view.includes('Det tælles ikke som at opsætningen mangler.'), true)
eq('betaling-banner', view.includes('data-testid="economic-payment-paid-error"') && view.includes('Det tælles ikke som at betalingen mangler.'), true)
eq('mangler opsaetning bliver', view.includes('— (mangler i opsætning)'), true)
eq('allerede bliver', view.includes('Betalingen er allerede registreret i e-conomic — sendes ikke igen.'), true)
eq('intet sendes i visningen', view.includes('Forhåndsvisning — intet sendes til e-conomic herfra.'), true)

console.log(fail ? `\n${fail} fejl` : '\npayment-preview-load-test OK')
process.exitCode = fail ? 1 : 0
