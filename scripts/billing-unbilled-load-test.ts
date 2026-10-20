/** Fakturakladden siger at en fejl ikke er 0 poster. Den aegte tomme tekst bliver. Koer: npx tsx scripts/billing-unbilled-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')

eq('fejl siger ikke 0', src.includes('data-testid="billing-unbilled-load-error"') && src.includes('Det tælles ikke som 0 poster.'), true)
eq('ingen-data er vaek', src.includes("{loadError ?? 'Ingen data'}"), false)
eq('aegte tom tekst bliver', src.includes('Ingen ufakturerede elementer på sagen'), true)
eq('tomme timer bliver', src.includes('Ingen ufakturerede timer på sagen.'), true)
eq('tomme materialer bliver', src.includes('Ingen ufakturerede materialer på sagen.'), true)
eq('tomme udlaeg bliver', src.includes('Ingen ufakturerede øvrige omkostninger på sagen.'), true)

console.log(fail ? `\n${fail} fejl` : '\nbilling-unbilled-load-test OK')
process.exitCode = fail ? 1 : 0
