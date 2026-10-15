/** Fakturakladdens materialer kan laeses paa mobil. Afkrydsning, antal og pris bliver. Koer: npx tsx scripts/billing-materials-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')
const start = src.indexOf('data-testid="billing-materials-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('beskrivelse ombrydes', mobile.includes('break-words">{m.description}'), true)
eq('leverandoer bliver', mobile.includes("{m.supplier_name ?? '—'}"), true)
eq('antal bliver', mobile.includes("m.quantity.toLocaleString('da-DK'"), true)
eq('enhed bliver', mobile.includes('{m.unit}'), true)
eq('stk-pris bliver', mobile.includes('fmtKr(m.unit_sales_price)'), true)
eq('total bliver', mobile.includes('fmtKr(m.total_sales_price)'), true)
eq('afkrydsning bliver', mobile.includes('toggleSet(selectedMaterials, setSelectedMaterials, m.id)'), true)
eq('manglende pris bliver', mobile.includes('Mangler salgspris'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block'), true)
eq('tom liste bliver', src.includes('Ingen ufakturerede materialer på sagen.'), true)

console.log(fail ? `\n${fail} fejl` : '\nbilling-materials-mobile-test OK')
process.exitCode = fail ? 1 : 0
