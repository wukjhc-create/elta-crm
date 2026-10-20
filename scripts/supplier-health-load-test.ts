/** Leverandoerstatus siger at en fejl ikke er 0 leverandoerer. Den groenne tekst bliver. Koer: npx tsx scripts/supplier-health-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/suppliers/supplier-health-overview.tsx', 'utf8')

eq('fejl er roed', src.includes('data-testid="supplier-health-load-error"') && src.includes('text-red-700 break-words'), true)
eq('fejlen er ikke 0', src.includes('Det tælles ikke som 0 leverandører.'), true)
eq('groen tekst bliver', src.includes('Alle leverandører online med frisk data'), true)
eq('mailfejl ombrydes', src.includes('text-xs text-red-700 break-words">{emailSync.lastError}'), true)
eq('tal bliver', src.includes('summary.onlineSuppliers') && src.includes('summary.totalSuppliers'), true)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-health-load-test OK')
process.exitCode = fail ? 1 : 0
