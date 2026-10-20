/** Indkoebsdrift-widgetten siger at en fejl ikke er 0 sager. Groen tom tekst og taellere bliver. Koer: npx tsx scripts/purchase-ops-widget-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/dashboard/purchase-operations-widget.tsx', 'utf8')

eq('fejl er roed', src.includes('data-testid="purchase-ops-widget-load-error"') && src.includes('text-red-700 break-words'), true)
eq('fejlen er ikke 0', src.includes('Det tælles ikke som 0 sager.'), true)
eq('graa fejl er vaek', src.includes('text-gray-400 py-4">{error || \'Ingen data\'}'), false)
eq('groen tom tekst bliver', src.includes('Ingen sager kræver indkøbshandling lige nu.'), true)
eq('nul er stadig groen', src.includes('data.total_cases_with_action === 0'), true)
eq('taellere bliver', src.includes('value={data.total_cases_with_action}') && src.includes('value={data.total_unconverted_lines}') && src.includes('value={data.overdue_invoice_count}') && src.includes('value={data.due_soon_invoice_count}'), true)
eq('intern tekst bliver', src.includes('Intern indkøbsøkonomi — ikke kundevendt.'), true)

console.log(fail ? `\n${fail} fejl` : '\npurchase-ops-widget-load-test OK')
process.exitCode = fail ? 1 : 0
