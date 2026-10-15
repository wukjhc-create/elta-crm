/** Indkoebsdrift-siden siger at en fejl ikke er 0 sager. Tomme tekster og beloeb bliver. Koer: npx tsx scripts/purchase-ops-page-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/purchase-operations/purchase-operations-client.tsx', 'utf8')

eq('fejl er roed', src.includes('data-testid="purchase-ops-load-error"') && src.includes('text-red-700 break-words'), true)
eq('fejlen er ikke 0', src.includes('Det tælles ikke som 0 sager.'), true)
eq('ingen-data-fejlen er vaek', src.includes("text-red-600 py-4\">{error || 'Ingen data'}"), false)
eq('groen tom tekst bliver', src.includes('Ingen sager kræver indkøbshandling lige nu.'), true)
eq('filtertom bliver', src.includes('Ingen sager matcher de valgte filtre.'), true)
eq('beloeb bliver', src.includes('kr(c.unconverted_amount)'), true)

console.log(fail ? `\n${fail} fejl` : '\npurchase-ops-page-load-test OK')
process.exitCode = fail ? 1 : 0
