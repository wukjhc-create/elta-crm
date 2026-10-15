/** Pakkedetalje paa smal skaerm. Priser og sletning er de samme. Koer: npx tsx scripts/package-detail-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/packages/[id]/package-detail-client.tsx', 'utf8')

eq('sidebar stables', src.includes('flex flex-col lg:flex-row') && src.includes('w-full lg:w-80'), true)
eq('linjerne kan rulles', src.includes('overflow-x-auto') && src.includes('min-w-[720px]'), true)
eq('slet kan rammes paa mobil', src.includes('aria-label="Slet element"') && src.includes('opacity-100 sm:opacity-0 sm:group-hover:opacity-100'), true)
eq('slet kalder samme handler', src.includes('handleDeleteItem(item.id)'), true)
eq('gem og luk har navne', src.includes('aria-label="Gem element"') && src.includes('aria-label="Luk redigering"'), true)
eq('tilbage har et navn', src.includes('aria-label="Tilbage til pakker"'), true)
eq('indstillinger har et navn', src.includes('aria-label="Pakkeindstillinger"'), true)
eq('beskrivelse ombrydes', src.includes('hover:text-primary break-words'), true)
eq('kost bliver', src.includes('formatCurrency(summary.totalCost)'), true)
eq('salg bliver', src.includes('formatCurrency(summary.totalSale)'), true)
eq('linjetotal bliver', src.includes('formatCurrency(item.total_sale)'), true)

console.log(fail ? `\n${fail} fejl` : '\npackage-detail-mobile-test OK')
process.exitCode = fail ? 1 : 0
