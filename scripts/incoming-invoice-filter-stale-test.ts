/** Leverandoerfakturaer viser ikke et andet filters raekker naar hentningen fejler. Status og beloeb bliver. Koer: npx tsx scripts/incoming-invoice-filter-stale-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const view = fs.readFileSync('src/app/dashboard/incoming-invoices/list-client.tsx', 'utf8')
eq('andet filter skjules', view.includes('rowsTerm === listTerm && displayRows.map') && view.split('rowsTerm === listTerm && displayRows.map').length === 3, true)
eq('samme filter bliver', view.includes('De tidligere fakturaer bliver.'), true)
eq('rydder ikke listen', view.includes('setRows([])'), false)
eq('aegte liste bliver', view.includes('setRows(next.rows)') && view.includes('setRowsTerm(listTerm)'), true)
eq('ikke ingen fakturaer', view.includes('Det tælles ikke som ingen fakturaer.'), true)
eq('beloeb bliver', view.includes('fmtAmount(r.amount_incl_vat, r.currency)'), true)
eq('forfald bliver', view.includes("due ? 'approved' : filter"), true)

console.log(fail ? `\n${fail} fejl` : '\nincoming-invoice-filter-stale-test OK')
process.exitCode = fail ? 1 : 0
