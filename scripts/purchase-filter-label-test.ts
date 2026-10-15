/** Indkoebsfiltre siger hvad de er, og soegningen ombrydes. Filtrene bliver. Koer: npx tsx scripts/purchase-filter-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/purchase-operations/purchase-operations-client.tsx', 'utf8')
eq('aarsag viser om den er valgt', src.includes('aria-pressed={reason === f.value}'), true)
eq('soegning har et navn', src.includes('aria-label="Søg indkøb"'), true)
eq('pladsholder bliver', src.includes('placeholder="Søg sag, kunde, leverandør, fakturanr…"'), true)
eq('soegning ombrydes', src.includes('flex flex-wrap items-center gap-2 flex-1 min-w-[220px]'), true)
eq('leverandoer har et navn', src.includes('aria-label="Leverandør"'), true)
eq('aarsag-filter bliver', src.includes('setParams({ reason: f.value })'), true)
eq('tekstsoegning bliver', src.includes('setParams({ q: searchInput.trim() || null })'), true)

console.log(fail ? `\n${fail} fejl` : '\npurchase-filter-label-test OK')
process.exitCode = fail ? 1 : 0
