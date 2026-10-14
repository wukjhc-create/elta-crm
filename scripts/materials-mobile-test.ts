/** Mobilkort på sagens materialer. Kør: npx tsx scripts/materials-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const file = 'src/app/dashboard/orders/[id]/order-materials-tab.tsx'
const text = fs.readFileSync(file, 'utf8')
const start = 'data-testid="materials-mobile-list"'
const end = 'hidden md:block'
const a = text.indexOf(start)
const b = text.indexOf(end, a + start.length)
const mobile = a >= 0 && b > a ? text.slice(a, b) : ''

eq('materialekort findes', mobile.length > 0, true)
eq('kortet viser antal', mobile.includes('r.quantity'), true)
eq('salgspris kræver samme gate', mobile.includes('canSeePrices') && mobile.includes('unit_sales_price'), true)
eq('kost kræver samme gate', mobile.includes('showCost') && mobile.includes('unit_cost'), true)
eq('rediger og slet er de samme knapper', mobile.includes('setEditing(r)') && mobile.includes('handleDelete(r)'), true)
eq('kortet fordobler ikke DB-test-id', mobile.includes('materials-db-row'), false)
eq('tabellen beholder DB-rækken', text.includes('data-testid="materials-db-row"'), true)

console.log(fail ? `\n${fail} fejl` : '\nmaterials-mobile-test OK')
process.exitCode = fail ? 1 : 0
