/** Sagens indkøbskort ombryder leverandørnavnet. Beløb bliver bag can_view_amounts. Kør: npx tsx scripts/case-supplier-name-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const lines = fs.readFileSync('src/components/modules/orders/case-unconverted-supplier-lines-card.tsx', 'utf8')
const summary = fs.readFileSync('src/components/modules/orders/case-purchase-summary-card.tsx', 'utf8')

eq('ukonverteret navn ombrydes', lines.includes('break-words min-w-0">{iv.supplier_name'), true)
eq('ukonverteret klipper ikke', lines.includes('truncate'), false)
eq('beloeb kraever can_view_amounts', lines.includes('data.can_view_amounts && iv.unconverted_amount'), true)
eq('intern tekst bliver', lines.includes('Intern indkøbsøkonomi — ikke kundevendt.'), true)
eq('leverandoer ombrydes', summary.includes('break-words min-w-0 text-gray-700">{b.supplier_name}'), true)
eq('faktura ombrydes', summary.includes('break-words min-w-0 text-gray-700 inline-flex items-start gap-1'), true)
eq('oversigt klipper ikke navn', summary.includes('truncate'), false)
eq('beloeb bliver', summary.includes('kr(b.total_cost)') && summary.includes('kr(iv.amount_incl_vat)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-supplier-name-wrap-test OK')
process.exitCode = fail ? 1 : 0
