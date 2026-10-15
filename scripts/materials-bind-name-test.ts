/** Materialebind ombryder leverandørnavn og SKU. Kost og Bind bliver. Koer: npx tsx scripts/materials-bind-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/materials/materials-admin.tsx', 'utf8')
const start = src.indexOf('supplier_products')
const block = src.slice(start)

eq('navn ombrydes', block.includes('font-medium break-words">{sp.supplier_name}'), true)
eq('linje ombrydes', block.includes('text-xs text-gray-500 break-words'), true)
eq('navn klippes ikke', block.includes('font-medium truncate'), false)
eq('kost bliver', block.includes('formatCurrency(sp.cost_price)'), true)
eq('bind bliver', block.includes('handleBind(sp)'), true)
eq('kort soegning bliver', block.includes('Skriv mindst 2 tegn for at søge.'), true)
eq('ingen resultater bliver', block.includes('Ingen resultater.'), true)

console.log(fail ? `\n${fail} fejl` : '\nmaterials-bind-name-test OK')
process.exitCode = fail ? 1 : 0
