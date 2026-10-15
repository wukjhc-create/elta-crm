/** Tilbudsopfoelgning ombryder titel og kunde. Beløb og tekster er de samme. Koer: npx tsx scripts/offer-followup-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/offers/offer-followup-card.tsx', 'utf8')
const rowStart = src.indexOf('function Row')
const row = src.slice(rowStart)

eq('overskriften ombrydes', src.includes('flex flex-wrap items-center gap-x-2 gap-y-1 mb-3'), true)
eq('titel ombrydes', row.includes('text-sm font-medium break-words'), true)
eq('kunde og beloeb ombrydes', row.includes('text-xs text-gray-500 break-words'), true)
eq('titel klippes ikke', row.includes('truncate'), false)
eq('beloeb bliver', row.includes('kr(o.final_amount)'), true)
eq('ring bliver', row.includes('> Ring'), true)
eq('aabn bliver', row.includes('Åbn'), true)
eq('ventetiden bliver', src.includes('sendt for under 3 dage siden'), true)
eq('manuel opfoelgning bliver', src.includes('Automatiske kundepåmindelser er ikke slået til — opfølgning sker manuelt herfra.'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-followup-mobile-test OK')
process.exitCode = fail ? 1 : 0
