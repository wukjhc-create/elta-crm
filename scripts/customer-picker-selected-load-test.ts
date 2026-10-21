/** En fejlet forvalgt kunde er ikke ingen kunde. Et aegte tomt opslag bliver. Koer: npx tsx scripts/customer-picker-selected-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const action = fs.readFileSync('src/lib/actions/customers.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getCustomerPickerItemAction'), action.indexOf('function safeCustomerSort'))
const view = fs.readFileSync('src/components/shared/customer-picker.tsx', 'utf8')
eq('laesefejl er ikke fundet', fn.includes("if (error) return { success: false, error: 'Kunne ikke hente kunde' }"), true)
eq('aegte tom bliver', fn.includes('return { success: true, data: (data as CustomerPickerItem | null) ?? null }'), true)
eq('fejl kommer foer tom', fn.indexOf('if (error)') < fn.indexOf('return { success: true, data:'), true)
eq('banneret siger det', view.includes('data-testid="customer-picker-selected-error"') && view.includes('Kunden kunne ikke hentes. Det tælles ikke som ingen kunde.'), true)
eq('kast viser fejl', view.includes("setSelectedError('Kunden kunne ikke hentes. Det tælles ikke som ingen kunde.')"), true)
eq('samme id hentes ikke igen', view.includes('loadedFor.current === value'), true)
eq('soegningsfejl bliver', view.includes('data-testid="customer-picker-search-error"') && view.includes('Ingen kunder fundet'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\ncustomer-picker-selected-load-test OK')
process.exitCode = fail ? 1 : 0
