/** Portefolje-widgetten siger at en fejl ikke er 0 kr udestaaende. Groen tom tekst og beloeb bliver. Koer: npx tsx scripts/portfolio-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/dashboard/outstanding-portfolio-widget.tsx', 'utf8')

eq('fejl er roed', src.includes('data-testid="portfolio-load-error"') && src.includes('text-red-700 break-words'), true)
eq('fejlen er ikke 0 kr', src.includes('Det tælles ikke som 0 kr udestående.'), true)
eq('graa fejl er vaek', src.includes('text-gray-400 py-4">{error || \'Ingen data\'}'), false)
eq('groen tom tekst bliver', src.includes('Ingen udestående på aktive sager.'), true)
eq('nul er stadig groen', src.includes('data.cases_with_outstanding === 0'), true)
eq('beloeb bliver', src.includes('kr(data.total_outstanding)') && src.includes('kr(t.outstanding)'), true)
eq('kost holdes ude', src.includes('ingen intern kost, margin eller dækningsbidrag'), true)

console.log(fail ? `\n${fail} fejl` : '\nportfolio-load-test OK')
process.exitCode = fail ? 1 : 0
