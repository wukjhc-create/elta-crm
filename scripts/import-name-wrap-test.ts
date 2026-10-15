/** Importens produktnavn ombrydes. Priser og udsnit er de samme. Koer: npx tsx scripts/import-name-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const wizard = fs.readFileSync('src/components/modules/suppliers/import-wizard.tsx', 'utf8')
const history = fs.readFileSync('src/components/modules/suppliers/import-history.tsx', 'utf8')

eq('eksempel ombryder navn', wizard.includes('max-w-[300px] break-words">{row.parsed.name}'), true)
eq('eksempel ombryder varenummer', wizard.includes('break-all">{row.parsed.sku}'), true)
eq('aendring ombryder navn', wizard.includes('max-w-[200px] break-words">{change.product_name}'), true)
eq('guiden klipper ikke navne', wizard.includes('truncate'), false)
eq('guiden viser kost', wizard.includes('formatCurrency(row.parsed.cost_price, \'DKK\', 2)'), true)
eq('guiden viser kun 20 aendringer', wizard.includes('result.price_changes.slice(0, 20)'), true)
eq('historik ombryder navn', history.includes('max-w-[150px] break-words'), true)
eq('historik klipper ikke navn', history.includes('truncate'), false)
eq('historik viser foer-pris', history.includes('formatCurrency(change.old_cost_price)'), true)
eq('tom historik bliver', history.includes('Ingen prisændringer i denne import'), true)
eq('tom import siger naeste skridt', history.includes('Brug Importer produkter ovenfor.'), true)
eq('filnavn ombrydes', history.includes('font-medium break-all">{batch.filename'), true)
eq('detaljer har et navn', history.includes('aria-label="Vis importdetaljer"') && history.includes('handleViewDetails(batch)'), true)
eq('raekker bliver', history.includes("batch.total_rows?.toLocaleString('da-DK')"), true)

console.log(fail ? `\n${fail} fejl` : '\nimport-name-wrap-test OK')
process.exitCode = fail ? 1 : 0
