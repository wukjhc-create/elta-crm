/** Materialebindets kostpris ombrydes. formatCurrency og Bind bliver. Koer: npx tsx scripts/materials-bind-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/materials/materials-admin.tsx', 'utf8')
const start = src.indexOf('results.map((sp)')
const end = src.indexOf('formatCurrency(sp.cost_price)', start)
const row = src.slice(start, end)
eq('raekken findes', start > 0 && end > start, true)
eq('beloeb kan krympe', row.includes('text-right min-w-0'), true)
eq('beloeb ombrydes', row.includes('text-sm font-medium break-words'), true)
eq('beloeb er ikke shrink-0', row.includes('text-right shrink-0'), false)
eq('formatCurrency bliver', src.includes('formatCurrency(sp.cost_price)'), true)
eq('navn ombrydes', row.includes('font-medium break-words">{sp.supplier_name}'), true)
eq('bind bliver', src.includes('handleBind(sp)'), true)
eq('lagertekst bliver', src.includes("sp.is_available ? 'På lager' : 'Ikke ledig'"), true)
eq('tom soegning bliver', src.includes('Skriv mindst 2 tegn for at søge.'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nmaterials-bind-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
