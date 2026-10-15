/** Prissimulatoren stabler felter og ombryder scenarienavn. Tallene er de samme. Koer: npx tsx scripts/profit-simulator-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calculations/profit-simulator/profit-simulator-client.tsx', 'utf8')

eq('felter stabler paa mobil', src.includes('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'), true)
eq('noegletal stabler paa mobil', src.includes('grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm'), true)
eq('scenarienavn ombrydes', src.includes('w-36 text-xs text-gray-600 text-right break-words">{scenario.name}'), true)
eq('scenarienavn klippes ikke', src.includes('truncate'), false)
eq('soejle viser stadig inkl moms', src.includes('formatCurrency(scenario.final_amount)'), true)
eq('soejlebredde er den samme', src.includes('(scenario.final_amount / maxAmount) * 100'), true)
eq('standard-scenarie bliver', src.includes("scenario.name === 'Standard margin'"), true)
eq('simuler sender de samme felter', src.includes('overhead_percentage: overheadPct') && src.includes('vat_percentage: 25'), true)
eq('materiale-start er den samme', src.includes('useState(50000)'), true)

console.log(fail ? `\n${fail} fejl` : '\nprofit-simulator-mobile-test OK')
process.exitCode = fail ? 1 : 0
