/** Kundeimportens forhaandsvisning kan laeses paa mobil. Status bliver. Koer: npx tsx scripts/customer-import-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-import-dialog.tsx', 'utf8')
const start = src.indexOf('data-testid="customer-import-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('firma bliver', mobile.includes("{r.company_name || '—'}"), true)
eq('email bliver', mobile.includes("{r.email || '—'}"), true)
eq('linje bliver', mobile.includes('{r.line}'), true)
eq('status bliver', mobile.includes("{r.status === 'new' ? 'Ny' : r.reason}"), true)
eq('desktop-raekke bliver', src.slice(start).includes('data-testid="customer-import-row"'), true)
eq('kortet kopierer ikke raekke-testid', mobile.includes('customer-import-row'), false)
eq('bekraeft bliver', src.includes('data-testid="customer-import-confirm"'), true)
eq('import-kaldet bliver', src.includes('importCustomersAction'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-import-mobile-test OK')
process.exitCode = fail ? 1 : 0
