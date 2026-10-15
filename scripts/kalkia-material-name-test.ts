/** Kalkia-materialelisten ombryder navnet. Kost, antal og DB bliver. Koer: npx tsx scripts/kalkia-material-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/kalkia/MaterialSummary.tsx', 'utf8')

eq('navn ombrydes', src.includes('font-medium text-sm break-words">{mat.name}'), true)
eq('brug ombrydes', src.includes('text-xs text-gray-500 break-words'), true)
eq('navn klippes ikke', src.includes('font-medium text-sm truncate'), false)
eq('kost bliver', src.includes('formatCurrency(mat.totalCost)'), true)
eq('db bliver', src.includes('calculateDBAmount(mat.totalCost, mat.totalSale)') && src.includes('formatCurrency(margin)'), true)
eq('procent bliver', src.includes('calculateDBPercentage(mat.totalCost, mat.totalSale)'), true)
eq('antal bliver', src.includes('{mat.totalQuantity}'), true)

console.log(fail ? `\n${fail} fejl` : '\nkalkia-material-name-test OK')
process.exitCode = fail ? 1 : 0
