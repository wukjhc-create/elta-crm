/** Indkoebsdriftens summering kan krympe. kr() og canAmt bliver. Koer: npx tsx scripts/purchase-ops-summary-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/purchase-operations/purchase-operations-client.tsx', 'utf8')
const gridStart = src.indexOf('grid grid-cols-2 lg:grid-cols-4 gap-3 min-w-0')
const grid = src.slice(gridStart, src.indexOf('Filter bar', gridStart))
eq('gitteret kan krympe', gridStart > 0, true)
eq('fire knapper kan krympe', grid.split('<button').length - 1, 4)
eq('hver knap kan krympe', grid.split('<button').slice(1).every((b) => b.includes('min-w-0')), true)
eq('ukonverteret beloeb ombrydes', grid.includes('break-words">{kr(data.summary.total_unconverted_amount)}'), true)
eq('beloeb kraever canAmt', grid.includes('canAmt && data.summary.total_unconverted_amount != null'), true)
eq('etiketter ombrydes', grid.includes('break-words">Forfalder inden 7 dage') && grid.includes('break-words">Ukonverterede linjer'), true)
eq('kr bliver', src.includes("const kr = (n: number | null) => (n == null ? '—' : formatCurrency(n, data?.currency || 'DKK', 0))"), true)
eq('sagskortets beloeb bliver', src.includes('kr(c.unconverted_amount)'), true)

console.log(fail ? `\n${fail} fejl` : '\npurchase-ops-summary-wrap-test OK')
process.exitCode = fail ? 1 : 0
