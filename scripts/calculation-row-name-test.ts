/** Kalkulationslinjens knapper siger hvilken linje. Tallene bliver. Koer: npx tsx scripts/calculation-row-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calculations/[id]/calculation-detail-client.tsx', 'utf8')

eq('rediger siger linjen', src.includes('aria-label={`Rediger ${row.description}`}'), true)
eq('slet siger linjen', src.includes('aria-label={`Slet ${row.description}`}'), true)
eq('slet kalder stadig handleDeleteRow', src.includes('onClick={() => handleDeleteRow(row)}'), true)
eq('total bliver', src.includes('formatCurrency(row.total)'), true)
eq('db bliver', src.includes('formatCurrency(row.profit_amount || 0)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalculation-row-name-test OK')
process.exitCode = fail ? 1 : 0
