/** Medarbejderokonomiens noegletal og navn ombrydes. Formler og kost-gate bliver. Koer: npx tsx scripts/employee-economy-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/economy/employee-economy-client.tsx', 'utf8')
const mobile = src.slice(src.indexOf('data-testid="employee-economy-mobile"'), src.indexOf('hidden md:block overflow-x-auto'))
const card = src.slice(src.indexOf('function StatCard'), src.length)
eq('totaler kan krympe', src.includes('grid grid-cols-2 md:grid-cols-5 gap-3 min-w-0" data-testid="employee-economy-totals"'), true)
eq('kortet kan krympe', card.includes('bg-white rounded-lg ring-1 ring-gray-200 p-4 min-w-0'), true)
eq('beloeb ombrydes', card.includes('text-xl font-semibold tabular-nums break-words'), true)
eq('etiket ombrydes', card.includes('text-xs text-gray-500 break-words">{label}'), true)
eq('navn ombrydes', mobile.includes('break-words">{e.employee_name}'), true)
eq('salg ombrydes', mobile.includes('break-words">{formatNumber(e.hours, 2)} t · Salg {formatCurrency(e.labor_sale)}'), true)
eq('kostlinje ombrydes', mobile.includes('text-xs text-gray-700 break-words'), true)
eq('kost bliver', mobile.includes('formatCurrency(e.labor_cost ?? 0)') && mobile.includes('formatCurrency(e.db_amount ?? 0)'), true)
eq('kost kraever showRowCost', mobile.indexOf('labor_cost') > mobile.indexOf('{showRowCost && ('), true)
eq('samlet salg bliver', src.includes('value={formatCurrency(totalSale)}'), true)
eq('totaler ligger uden for kortet', mobile.includes('employee-economy-totals'), false)

console.log(fail ? `\n${fail} fejl` : '\nemployee-economy-wrap-test OK')
process.exitCode = fail ? 1 : 0
