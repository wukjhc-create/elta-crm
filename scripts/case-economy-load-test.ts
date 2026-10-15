/** Sagens okonomifane siger at en fejl ikke er 0 kr. Formler og leverandoerliste bliver. Koer: npx tsx scripts/case-economy-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-economy-tab.tsx', 'utf8')

eq('fejl siger ikke 0', src.includes('data-testid="case-economy-load-error"') && src.includes('Det tælles ikke som 0 kr.'), true)
eq('ingen-data er vaek', src.includes("{error ?? 'Ingen data'}"), false)
eq('kost bliver', src.includes('fmtKr(data.totals.cost)'), true)
eq('db bliver', src.includes('marginPalette(data.totals.margin_percentage, data.db_thresholds)'), true)
eq('leverandoerliste bliver', src.includes('data-testid="case-supplier-invoices-mobile"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-economy-load-test OK')
process.exitCode = fail ? 1 : 0
