/** Kalkia-knuden ombryder leverandørvarens navn. Kost og fjern-link bliver. Koer: npx tsx scripts/kalkia-node-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/kalkia/nodes/[id]/kalkia-node-detail-client.tsx', 'utf8')

eq('navn ombrydes', src.includes('font-medium text-sm break-words min-w-0') && src.includes('{option.supplier_name}'), true)
eq('navn klippes ikke', src.includes('font-medium text-sm truncate'), false)
eq('sku ombrydes', src.includes('font-mono break-all">{option.supplier_sku}'), true)
eq('kost bliver', src.includes("formatCurrency(option.cost_price, 'DKK', 2)"), true)
eq('liste bliver', src.includes("formatCurrency(option.list_price, 'DKK', 2)"), true)
eq('fjern link bliver', src.includes('aria-label="Fjern link"') && src.includes('handleUnlink(material.id)'), true)

console.log(fail ? `\n${fail} fejl` : '\nkalkia-node-name-test OK')
process.exitCode = fail ? 1 : 0
