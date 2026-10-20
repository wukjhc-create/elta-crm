/** Globale faktorer siger naar listen ikke kan hentes. Et aegte tomt svar bliver. Koer: npx tsx scripts/global-factors-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/settings/kalkia/factors/page.tsx', 'utf8')
eq('siden sender fejl', page.includes("factorsResult.success ? null : factorsResult.error || 'Kunne ikke hente globale faktorer'"), true)
eq('aegte liste bliver', page.includes('factorsResult.success && factorsResult.data ? factorsResult.data : []'), true)

const view = fs.readFileSync('src/app/dashboard/settings/kalkia/factors/global-factors-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="global-factors-load-error"') && view.includes('Det tælles ikke som ingen faktorer.'), true)
eq('kategorier bliver', view.includes('Object.entries(groupedFactors).map'), true)
eq('vaerdi bliver', view.includes("style: 'currency'") && view.includes("currency: 'DKK'"), true)
eq('formler bliver', view.includes('Beregningsformler'), true)

console.log(fail ? `\n${fail} fejl` : '\nglobal-factors-load-test OK')
process.exitCode = fail ? 1 : 0
