/** Ukonverterede linjer siger at en fejl ikke er 0 linjer. Groen tom tekst og beloeb bliver. Koer: npx tsx scripts/unconverted-lines-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/case-unconverted-supplier-lines-card.tsx', 'utf8')

eq('fejl er roed', src.includes('data-testid="unconverted-lines-load-error"') && src.includes('text-red-700 break-words'), true)
eq('fejlen er ikke 0', src.includes('Det tælles ikke som 0 linjer.'), true)
eq('graa fejl er vaek', src.includes('text-gray-400 py-2">{error || \'Ingen data\'}'), false)
eq('groen tom tekst bliver', src.includes('Alle leverandørfaktura-linjer på sagen er konverteret.'), true)
eq('nul er stadig groen', src.includes('data.unconverted_line_count === 0'), true)
eq('beloeb bliver', src.includes('kr(data.total_unconverted_amount)'), true)
eq('taellere bliver', src.includes('data.unconverted_line_count') && src.includes('data.unconverted_invoice_count'), true)

console.log(fail ? `\n${fail} fejl` : '\nunconverted-lines-load-test OK')
process.exitCode = fail ? 1 : 0
