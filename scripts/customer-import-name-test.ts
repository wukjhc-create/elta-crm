/** Kundeimport viser hele filnavnet og fejlteksten. Tællere og input bliver. Koer: npx tsx scripts/customer-import-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-import-dialog.tsx', 'utf8')

eq('filnavn ombrydes', src.includes('text-sm text-gray-600 break-all min-w-0">{fileName}'), true)
eq('filnavn klippes ikke', src.includes('truncate">{fileName}'), false)
eq('fejl ombrydes', src.includes('text-sm text-red-700 break-words" data-testid="customer-import-error"'), true)
eq('input bliver', src.includes('data-testid="customer-import-input"'), true)
eq('taellere bliver', src.includes('data-testid="import-count-new"') && src.includes('data-testid="import-count-duplicate"') && src.includes('data-testid="import-count-invalid"'), true)
eq('luk har et navn', src.includes('aria-label="Luk"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-import-name-test OK')
process.exitCode = fail ? 1 : 0
