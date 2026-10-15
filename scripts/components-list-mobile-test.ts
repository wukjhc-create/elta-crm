/** Komponentlisten paa sma skaerme. Priser og tid bliver. Koer: npx tsx scripts/components-list-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/components/components-client.tsx', 'utf8')

eq('navn ombrydes', src.includes('font-medium text-gray-900 break-words">{comp.name}'), true)
eq('meta ombrydes', src.includes('flex flex-wrap items-center gap-x-3 gap-y-1'), true)
eq('soegning fylder bredden', src.includes('min-w-0 w-full sm:min-w-[250px]'), true)
eq('tom kategori siger naeste skridt', src.includes('Prøv en anden søgning eller kategori.'), true)
eq('tom liste bliver', src.includes('Ingen komponenter fundet'), true)
eq('link bliver', src.includes('/dashboard/settings/components/${comp.id}'), true)
eq('tid bliver', src.includes('formatTimeMinutes(comp.base_time_minutes)'), true)
eq('kost bliver', src.includes('formatCurrency(comp.default_cost_price || 0)'), true)
eq('salg bliver', src.includes('formatCurrency(comp.default_sale_price || 0)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncomponents-list-mobile-test OK')
process.exitCode = fail ? 1 : 0
