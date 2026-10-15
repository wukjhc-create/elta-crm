/** Pakkelisten: tom søgning, ombrydning og mobilmenu. Kør: npx tsx scripts/packages-list-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/packages/packages-client.tsx', 'utf8')

eq('filter bruger den anvendte soegning', src.includes('initialFilters.search.trim() || initialFilters.category_id'), true)
eq('tom liste uden filter bliver', src.includes('Ingen pakker endnu'), true)
eq('foerste pakke bliver', src.includes('Opret din første pakke for at komme i gang'), true)
eq('tom soegning siger naeste skridt', src.includes('Ingen pakker matcher søgningen'), true)
eq('ryd soegning', src.includes('Ryd søgning eller kategori, eller opret en ny pakke.'), true)
eq('overskriften ombrydes', src.includes('flex flex-wrap items-start justify-between gap-3'), true)
eq('filtre stables', src.includes('flex flex-col sm:flex-row gap-3'), true)
eq('soeg har et navn', src.includes('aria-label="Søg pakker"'), true)
eq('menuen kan rammes paa mobil', src.includes('opacity-100 sm:opacity-0 sm:group-hover:opacity-100'), true)
eq('menuen har et navn', src.includes('aria-label="Flere handlinger"'), true)
eq('pakkenavn ombrydes', src.includes('font-semibold break-words pr-8">{pkg.name}'), true)
eq('kostpris bliver', src.includes('formatCurrency(pkg.total_cost_price)'), true)
eq('salgspris bliver', src.includes('formatCurrency(pkg.total_sale_price)'), true)

console.log(fail ? `\n${fail} fejl` : '\npackages-list-mobile-test OK')
process.exitCode = fail ? 1 : 0
