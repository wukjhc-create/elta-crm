/** Tom tilbudsliste siger hvad man goer. Koer: npx tsx scripts/line-items-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/shared/line-items-table.tsx', 'utf8')
eq('tom tekst findes', src.includes('data-testid="line-items-empty"'), true)
eq('redigerbar tekst peger paa knappen', src.includes('Ingen linjer endnu. Tilføj den første linje nedenfor.'), true)
eq('laast tekst er uden knap', src.includes('Ingen linjer på tilbuddet.'), true)
eq('tilfoej-knappen er der stadig', src.includes('Tilføj linje'), true)
eq('skygge-db er der stadig', src.includes('shadowOfferDb'), true)

console.log(fail ? `\n${fail} fejl` : '\nline-items-empty-test OK')
process.exitCode = fail ? 1 : 0
