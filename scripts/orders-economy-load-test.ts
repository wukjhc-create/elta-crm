/** Sagsoekonomi siger fejl, og et faktureringsfilter bliver ikke en tom liste. Beloeb bliver. Koer: npx tsx scripts/orders-economy-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/orders/page.tsx', 'utf8')
const view = fs.readFileSync('src/app/dashboard/orders/orders-list-client.tsx', 'utf8')
const match = fs.readFileSync('src/lib/invoices/case-billing-status.ts', 'utf8')

eq('fejl springer filteret over', page.includes('if (billingFilter && !economyError)'), true)
eq('fejl sendes', page.includes('economyError={economyError}'), true)
eq('banner', view.includes('data-testid="orders-economy-load-error"') && view.includes('Det tælles ikke som ingen sager.'), true)
eq('udestaaende er ikke 0', view.includes('Udestående tælles ikke som 0 kr.'), true)
eq('beloeb bliver', view.includes('fmtAmount(e!.outstanding_total)'), true)
eq('tom oekonomi matcher ikke', match.includes('if (!e) return false'), true)

console.log(fail ? `\n${fail} fejl` : '\norders-economy-load-test OK')
process.exitCode = fail ? 1 : 0
