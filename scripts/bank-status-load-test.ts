/** En fejlet banklaesning er ikke manglende bank. Tilladelse og advarslen bliver. Koer: npx tsx scripts/bank-status-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/invoices.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getInvoicePaymentInfoStatusAction'), action.indexOf('export async function', action.indexOf('export async function getInvoicePaymentInfoStatusAction') + 20))
const view = fs.readFileSync('src/app/dashboard/invoices/[id]/detail-client.tsx', 'utf8')
const bank = fs.readFileSync('src/lib/invoices/bank-info.ts', 'utf8')
eq('laesefejl er ikke manglende bank', fn.includes("if (error) return { ok: false, bankConfigured: true, message: 'Kunne ikke tjekke bankoplysninger' }"), true)
eq('fejl kommer foer bankinfo', fn.indexOf('if (error)') < fn.indexOf('invoiceBankInfo('), true)
eq('manglende tilladelse bliver', fn.includes("if (!hasPermission('invoices.view.all')) return { ok: false, bankConfigured: true }"), true)
eq('kendt svar saetter stadig flaget', view.includes('if (r.ok)') && view.includes('setBankConfigured(r.bankConfigured)'), true)
eq('besked viser fejl', view.includes('else if (r.message)') && view.includes('setBankStatusFailed(true)'), true)
eq('kast viser fejl', view.includes('.catch(() => setBankStatusFailed(true))'), true)
eq('banneret siger det', view.includes('data-testid="bank-status-load-error"') && view.includes('Bankoplysninger kunne ikke tjekkes. Det tælles ikke som at de mangler.'), true)
eq('advarslen bliver', view.includes('data-testid="bank-missing"') && view.includes('<strong>Bankoplysninger mangler.</strong>'), true)
eq('formel bliver', bank.includes('configured: !!regNo && !!account'), true)

console.log(fail ? `\n${fail} fejl` : '\nbank-status-load-test OK')
process.exitCode = fail ? 1 : 0
