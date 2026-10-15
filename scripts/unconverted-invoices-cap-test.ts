/** Ukonverterede fakturaer siger naar listen er klippet ved 8. Beloeb bliver. Koer: npx tsx scripts/unconverted-invoices-cap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/case-unconverted-supplier-lines-card.tsx', 'utf8')
eq('loftet bliver 8', src.includes('data.invoices.slice(0, 8)'), true)
eq('loftet siges', src.includes('data-testid="unconverted-invoices-capped"') && src.includes('Viser 8 af {data.invoices.length} fakturaer. De øvrige {data.invoices.length - 8} er ikke med i listen.'), true)
eq('kun naar der er flere', src.includes('data.invoices.length > 8 &&'), true)
eq('beloeb kraever adgang', src.includes('data.can_view_amounts && iv.unconverted_amount != null'), true)
eq('tom betyder konverteret', src.includes('Alle leverandørfaktura-linjer på sagen er konverteret.'), true)
eq('ikke kundevendt', src.includes('Intern indkøbsøkonomi — ikke kundevendt.'), true)
eq('navn klippes ikke', src.includes('truncate'), false)

console.log(fail ? `\n${fail} fejl` : '\nunconverted-invoices-cap-test OK')
process.exitCode = fail ? 1 : 0
