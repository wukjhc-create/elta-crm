/** Regnskabsstatus siger at en fejl ikke er "e-conomic mangler" og ikke er 0. Ikke-opsat og groen tekst bliver. Koer: npx tsx scripts/accounting-health-fetch-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const view = fs.readFileSync('src/components/modules/dashboard/accounting-health-widget.tsx', 'utf8')

eq('hentefejl er roed', view.includes('data-testid="accounting-health-load-error"') && view.includes('text-red-700 break-words'), true)
eq('hentefejl er ikke mangler', view.includes('Kunne ikke hente regnskabsstatus. Det tælles ikke som at e-conomic mangler, og det tælles ikke som 0.'), true)
eq('graa hentefejl er vaek', view.includes('text-gray-400 py-4">Kunne ikke hente regnskabsstatus.'), false)
eq('ikke opsat bliver', view.includes('e-conomic er ikke opsat endnu.'), true)
eq('groen tekst bliver', view.includes('Alt eksporteret — ingen fejl eller ventende fakturaer.'), true)
eq('tjek-banner bliver', view.includes('data-testid="accounting-health-ready-error"'), true)
eq('taelle-banner bliver', view.includes('data-testid="accounting-health-counts-error"'), true)

console.log(fail ? `\n${fail} fejl` : '\naccounting-health-fetch-test OK')
process.exitCode = fail ? 1 : 0
