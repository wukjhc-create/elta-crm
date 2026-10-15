/** Produktformularen stabler kategori og pris paa mobil. Priserne bliver. Koer: npx tsx scripts/product-form-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/products/product-form.tsx', 'utf8')

eq('kategori og enhed stables', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-4') && src.includes('htmlFor="category_id"') && src.includes('htmlFor="unit"'), true)
eq('kost og listepris stables', src.split('grid grid-cols-1 sm:grid-cols-2 gap-4').length - 1 === 2, true)
eq('kostpris bliver', src.includes('name="cost_price"') && src.includes('defaultValue={product?.cost_price || \'\'}'), true)
eq('listepris bliver', src.includes('name="list_price"') && src.includes('defaultValue={product?.list_price || \'\'}'), true)
eq('navn er koblet', src.includes('htmlFor="name"') && src.includes('id="name"'), true)
eq('opret bliver', src.includes("'Opret'") && src.includes("'Opdater'"), true)

console.log(fail ? `\n${fail} fejl` : '\nproduct-form-mobile-test OK')
process.exitCode = fail ? 1 : 0
