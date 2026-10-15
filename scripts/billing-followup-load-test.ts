/** Fakturaopfoelgning siger at en fejl ikke er 0 sager. Groen tom tekst og taellere bliver. Koer: npx tsx scripts/billing-followup-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/dashboard/billing-followup-widget.tsx', 'utf8')

eq('fejl er roed', src.includes('data-testid="billing-followup-load-error"') && src.includes('text-red-700 break-words'), true)
eq('fejlen er ikke 0', src.includes('Det tælles ikke som 0 sager.'), true)
eq('graa fejl er vaek', src.includes('text-gray-400 py-4">{error || \'Ingen data\'}'), false)
eq('groen tom tekst bliver', src.includes('Ingen sager kræver fakturahandling lige nu.'), true)
eq('nul er stadig groen', src.includes('data.total_action === 0'), true)
eq('taellere bliver', src.includes('count={data.over_invoiced}') && src.includes('count={data.ready_final}') && src.includes('count={data.outstanding}'), true)
eq('kost holdes ude', src.includes('ingen intern kost, margin eller dækningsbidrag'), true)

console.log(fail ? `\n${fail} fejl` : '\nbilling-followup-load-test OK')
process.exitCode = fail ? 1 : 0
