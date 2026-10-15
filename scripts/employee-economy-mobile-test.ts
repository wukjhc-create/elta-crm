/** Medarbejderøkonomi på små skærme. Kør: npx tsx scripts/employee-economy-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/economy/employee-economy-client.tsx', 'utf8')
const start = src.indexOf('data-testid="employee-economy-mobile"')
const end = src.indexOf('hidden md:block overflow-x-auto')
const mobile = src.slice(start, end)
const cost = mobile.indexOf('labor_cost')

eq('mobil-liste findes', start > 0, true)
eq('tabellen er skjult under md', end > start, true)
eq('kortet viser navn, timer og salg', mobile.includes('employee_name') && mobile.includes('e.hours') && mobile.includes('labor_sale'), true)
eq('kost og db paa kortet kraever showRowCost', cost > mobile.lastIndexOf('{showRowCost && (', cost) && mobile.lastIndexOf('{showRowCost && (', cost) > 0, true)
eq('tom liste staar stadig', src.includes('Ingen lukkede timeregistreringer.'), true)
eq('tom liste siger naeste skridt', src.includes('Lukkede timer vises her, når de er afsluttet.'), true)
eq('totaler ligger uden for kortet', mobile.includes('employee-economy-totals'), false)

console.log(fail ? `\n${fail} fejl` : '\nemployee-economy-mobile-test OK')
process.exitCode = fail ? 1 : 0
