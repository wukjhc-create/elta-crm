/** Kundeprisaftaler ombrydes, og ikonerne har et navn. Koer: npx tsx scripts/customer-pricing-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-pricing.tsx', 'utf8')
const page = fs.readFileSync('src/app/dashboard/customers/[id]/page.tsx', 'utf8')

eq('tom aftale forklarer naeste skridt', src.includes('data-testid="customer-pricing-empty"') && src.includes('særlig rabat'), true)
eq('aftalen ombrydes', src.includes('flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'), true)
eq('rediger og slet har et navn', src.includes('aria-label="Rediger aftale"') && src.includes('aria-label="Slet aftale"'), true)
eq('soegning har et navn', src.includes('aria-label="Søg pris"'), true)
eq('prisresultat ombrydes', src.includes('flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'), true)
eq('kost vises stadig i opslaget', src.includes('effective_cost_price'), true)
eq('siden kraever tools.pricing', page.includes("pageHasPermission('tools.pricing')"), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-pricing-mobile-test OK')
process.exitCode = fail ? 1 : 0
