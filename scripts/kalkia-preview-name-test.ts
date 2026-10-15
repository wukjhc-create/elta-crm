/** Kalkia-forhåndsvisning ombryder komponent og materiale. Kost og antal bliver. Koer: npx tsx scripts/kalkia-preview-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/kalkia/CalculationPreview.tsx', 'utf8')

eq('komponent ombrydes', src.includes('font-medium break-words min-w-0">{item.componentName}'), true)
eq('materiale ombrydes', src.includes('text-gray-700 flex-1 min-w-0 break-words">{mat.name}'), true)
eq('komponent klippes ikke', src.includes('font-medium truncate'), false)
eq('detaljer har et navn', src.includes("aria-label={isExpanded ? 'Skjul detaljer' : 'Vis detaljer'}"), true)
eq('antal bliver', src.includes('{mat.quantity * item.quantity}'), true)
eq('kost bliver', src.includes('formatCurrency(mat.costPrice * mat.quantity * item.quantity)'), true)

console.log(fail ? `\n${fail} fejl` : '\nkalkia-preview-name-test OK')
process.exitCode = fail ? 1 : 0
