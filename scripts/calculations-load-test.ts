/** Kalkulationslisten siger naar den ikke kan hentes. En aekte tom liste bliver. Koer: npx tsx scripts/calculations-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/calculations/page.tsx', 'utf8')
eq('siden sender listefejl', page.includes("result.success ? null : result.error || 'Kunne ikke hente kalkulationer'"), true)
eq('aegte liste bliver', page.includes('result.success && result.data ? result.data : null'), true)

const view = fs.readFileSync('src/app/dashboard/calculations/calculations-client.tsx', 'utf8')
eq('listebanner', view.includes('data-testid="calculations-load-error"') && view.includes('Det tælles ikke som ingen kalkulationer.'), true)
eq('antal er ikke 0', view.includes('Det tælles ikke som 0 kalkulationer.'), true)
eq('tom liste kraever ingen fejl', view.includes('loadError ? (') && view.includes('calculations.length === 0'), true)
eq('aegte tom bliver', view.includes('Ingen kalkulationer fundet'), true)
eq('soegning bliver', view.includes('Prøv at ændre dine søgekriterier'), true)
eq('opret paa tom liste bliver', view.includes('Opret kalkulation'), true)
eq('opret kraever ingen fejl', view.includes('!search && !calculationType && !isTemplate'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalculations-load-test OK')
process.exitCode = fail ? 1 : 0
