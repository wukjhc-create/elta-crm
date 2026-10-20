/** Stage-fakturaer paa sagen beholdes naar hentningen fejler. Procent og beloeb bliver. Koer: npx tsx scripts/stage-invoices-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')
const start = src.indexOf('function StageInvoicesOverview')
const end = src.indexOf('const cumulativePct')
const head = src.slice(start, end)
eq('fejl toemmer ikke listen', !head.includes('setRows([])'), true)
eq('kast bliver en fejl', head.includes("setError('Kunne ikke hente stage-fakturaer')"), true)
eq('oversigten siger fejl', src.includes('data-testid="stage-invoices-load-error"') && src.includes('Det tælles ikke som ingen stage-fakturaer.'), true)
eq('procenten bliver', src.includes('netStagePercentage(r.billing_percentage, r.total_amount, r.credited_amount)'), true)
eq('inkl moms bliver', src.includes('Total inkl. moms'), true)
eq('tom succes skjuler stadig panelet', head.includes('if (!error) return null'), true)

console.log(fail ? `\n${fail} fejl` : '\nstage-invoices-load-test OK')
process.exitCode = fail ? 1 : 0
