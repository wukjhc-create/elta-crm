/** Udvidede leverandoerfakturaer siger at en fejl ikke er 0 linjer. Groen tom tekst bliver. Koer: npx tsx scripts/purchase-ops-expand-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/purchase-operations/purchase-operations-client.tsx', 'utf8')

eq('fejl er roed', src.includes('data-testid="purchase-ops-expand-error"') && src.includes('text-red-700 break-words'), true)
eq('fejlen er ikke 0', src.includes('Det tælles ikke som 0 linjer.'), true)
eq('ingen-data er vaek', src.includes("expansion.error || 'Ingen data'"), false)
eq('groen tom tekst bliver', src.includes('Alle leverandørfaktura-linjer på sagen er konverteret.'), true)
eq('listefejl bliver', src.includes('data-testid="purchase-ops-load-error"'), true)
eq('beloeb bliver', src.includes('kr(c.unconverted_amount)'), true)

console.log(fail ? `\n${fail} fejl` : '\npurchase-ops-expand-load-test OK')
process.exitCode = fail ? 1 : 0
