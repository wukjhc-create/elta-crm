/** Efterkalkulation siger naar hentningen kaster. Afvigelsestekst og 0 kr-reglen bliver. Koer: npx tsx scripts/aftercalc-load-throw-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

for (const file of [
  'src/app/dashboard/orders/[id]/case-aftercalc-panel.tsx',
  'src/app/dashboard/orders/[id]/case-offer-vs-actual-panel.tsx',
]) {
  const src = fs.readFileSync(file, 'utf8')
  eq(`${file} fanger kast`, src.includes("setError('Kunne ikke hente efterkalkulation')"), true)
  eq(`${file} siger ikke 0`, src.includes('Det tælles ikke som 0 kr.'), true)
  eq(`${file} henter stadig`, src.includes('Henter…'), true)
}

const lines = fs.readFileSync('src/app/dashboard/orders/[id]/case-aftercalc-panel.tsx', 'utf8')
eq('kan ikke beregnes bliver', lines.includes('Kan ikke beregnes'), true)
eq('linjeantal bliver', lines.includes('Tilbudt antal') && lines.includes('kr(r.offered_cost)'), true)

const ova = fs.readFileSync('src/app/dashboard/orders/[id]/case-offer-vs-actual-panel.tsx', 'utf8')
eq('brugt linje bliver', ova.includes('Den tælles ikke som 0 kr.'), true)
eq('data-status bliver', ova.includes('data-status={r.status}'), true)

console.log(fail ? `\n${fail} fejl` : '\naftercalc-load-throw-test OK')
process.exitCode = fail ? 1 : 0
