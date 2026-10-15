/** Kalkia-pakkebrowseren ombryder pakkenavn. Pris, DB og Tilføj bliver. Koer: npx tsx scripts/kalkia-package-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/kalkia/PackageBrowser.tsx', 'utf8')

eq('navn ombrydes', src.includes('font-medium break-words min-w-0">{pkg.name}'), true)
eq('beskrivelse viser to linjer', src.includes('text-xs text-gray-400 mt-1 break-words line-clamp-2'), true)
eq('navn klippes ikke', src.includes('font-medium truncate'), false)
eq('tid bliver', src.includes('formatTimeMinutes(pkg.total_time_minutes)'), true)
eq('kost bliver', src.includes('formatCurrency(pkg.total_cost_price)'), true)
eq('salg bliver', src.includes('formatCurrency(pkg.total_sale_price)'), true)
eq('db bliver', src.includes('pkg.db_percentage.toFixed(1)'), true)
eq('tilfoej bliver', src.includes('handleAddPackage(pkg)') && src.includes('Tilføj'), true)

console.log(fail ? `\n${fail} fejl` : '\nkalkia-package-name-test OK')
process.exitCode = fail ? 1 : 0
