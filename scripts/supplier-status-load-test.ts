/** Leverandoerkortet siger ikke offline naar status ikke kan hentes. Aegte offline bliver. Koer: npx tsx scripts/supplier-status-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/suppliers/supplier-status-card.tsx', 'utf8')

eq('fejl foer kortet', src.indexOf('data-testid="supplier-status-load-error"') < src.indexOf("status?.isOnline ? 'Online' : 'Offline'"), true)
eq('fejlen er ikke offline', src.includes('Det tælles ikke som offline.'), true)
eq('aegte offline bliver', src.includes("status?.isOnline ? 'Online' : 'Offline'"), true)
eq('test bliver', src.includes('testSupplierAPIConnection(supplierId)'), true)
eq('sync bliver', src.includes('syncSupplierPrices(supplierId)'), true)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-status-load-test OK')
process.exitCode = fail ? 1 : 0
