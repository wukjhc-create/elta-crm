/** Konverteringsvisningens tomme fejl er ikke 0 linjer. Action-teksten og kun-total bliver. Koer: npx tsx scripts/conversion-preview-fallback-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/conversion-preview-panel.tsx', 'utf8')

eq('banner bliver', view.includes('data-testid="conversion-preview-load-error"') && view.includes('text-red-800'), true)
eq('fallback er ikke 0', view.includes("error || 'Kunne ikke hente preview. Det tælles ikke som 0 linjer.'"), true)
eq('ingen-data er vaek', view.includes("error || 'Ingen data'"), false)
eq('kun-total bliver', view.includes('Ingen fakturalinjer — kun et totalbeløb.'), true)
eq('ingen linjer bliver', view.includes('Ingen linjer at konvertere.'), true)
eq('intet bogfoeres', !view.includes('approveInvoice'), true)

console.log(fail ? `\n${fail} fejl` : '\nconversion-preview-fallback-test OK')
process.exitCode = fail ? 1 : 0
