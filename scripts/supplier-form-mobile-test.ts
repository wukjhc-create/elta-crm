/** Leverandoerformularen stabler par paa mobil. Kode og e-conomic bliver. Koer: npx tsx scripts/supplier-form-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/suppliers/supplier-form.tsx', 'utf8')

eq('tre par stables', src.split('grid grid-cols-1 sm:grid-cols-2 gap-4').length - 1 === 3, true)
eq('ikke fast to kolonner', src.includes('grid grid-cols-2 gap-4'), false)
eq('navn er koblet', src.includes('htmlFor="name"') && src.includes('id="name"') && src.includes('value={formData.name}'), true)
eq('kode bliver versaler', src.includes('e.target.value.toUpperCase()'), true)
eq('economic-nummer bliver', src.includes('id="economic_supplier_number"') && src.includes('value={formData.economic_supplier_number}'), true)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-form-mobile-test OK')
process.exitCode = fail ? 1 : 0
