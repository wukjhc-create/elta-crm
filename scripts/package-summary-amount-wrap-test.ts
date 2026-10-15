/** Pakkens kost- og salgsoverblik ombryder beloeb. formatCurrency, sammendraget og DB-taersklerne bliver. Koer: npx tsx scripts/package-summary-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/packages/[id]/package-detail-client.tsx', 'utf8')
const start = src.indexOf('>Overblik<')
const end = src.indexOf('Add Item Dialog', start)
const block = src.slice(start, end)
eq('overblikket findes', start > 0 && end > start, true)
eq('sammendraget bliver', src.includes('const summary = calculateFinancialSummary(items)'), true)
eq('taerskel 30 bliver', block.includes('summary.dbPercentage >= 30'), true)
eq('taerskel 20 bliver', block.includes('summary.dbPercentage >= 20'), true)
eq('db-procent bliver', block.includes('summary.dbPercentage.toFixed(1)'), true)
eq('db-beloeb ombrydes', block.includes('text-2xl font-bold min-w-0 break-words') && block.includes('formatCurrency(summary.dbAmount)'), true)

const amounts = [
  'summary.componentsCost',
  'summary.productsCost',
  'summary.manualCost',
  'summary.laborCost',
  'summary.totalCost',
  'summary.componentsSale',
  'summary.productsSale',
  'summary.manualSale',
  'summary.laborSale',
  'summary.totalSale',
]
for (const key of amounts) {
  const token = 'formatCurrency(' + key + ')'
  const i = block.indexOf(token)
  const line = block.slice(Math.max(0, i - 80), i + token.length)
  eq(key + ' ombrydes', i > 0 && line.includes('min-w-0 break-words'), true)
}
eq('linjetabellen bliver', src.includes('overflow-x-auto') && src.includes('min-w-[720px]'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\npackage-summary-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
