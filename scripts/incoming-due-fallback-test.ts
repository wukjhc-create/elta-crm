/** Forfalds-widgettens tomme fejl er ikke 0 kr. Groen tekst, beloeb og action-tekst bliver. Koer: npx tsx scripts/incoming-due-fallback-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const view = fs.readFileSync('src/components/modules/dashboard/incoming-invoice-due-widget.tsx', 'utf8')
const action = fs.readFileSync('src/lib/actions/incoming-invoices.ts', 'utf8')

eq('fallback er ikke 0 kr', view.includes("error || 'Kunne ikke hente forfaldsoverblik. Det tælles ikke som 0 kr.'"), true)
eq('ingen-data er vaek', view.includes("error || 'Ingen data'"), false)
eq('banner bliver', view.includes('data-testid="incoming-due-load-error"') && view.includes('text-red-800'), true)
eq('groen tom bliver', view.includes('Ingen godkendte leverandørfakturaer forfalder lige nu.'), true)
eq('beloeb bliver', view.includes('kr(t.amount)'), true)
eq('action-tekst bliver', action.includes('Kunne ikke hente forfaldsoverblik. Det tælles ikke som 0.'), true)

console.log(fail ? `\n${fail} fejl` : '\nincoming-due-fallback-test OK')
process.exitCode = fail ? 1 : 0
