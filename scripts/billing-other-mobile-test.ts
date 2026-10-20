/** Fakturakladdens oevrige omkostninger kan laeses paa mobil. Afkrydsning, antal og total bliver. Koer: npx tsx scripts/billing-other-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')
const start = src.indexOf('data-testid="billing-other-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('beskrivelse ombrydes', mobile.includes('break-words">{o.description}'), true)
eq('dato bliver', mobile.includes('fmtDate(o.cost_date)'), true)
eq('kategori bliver', mobile.includes('CASE_OTHER_COST_CATEGORY_LABELS[cat] ?? o.category'), true)
eq('antal bliver', mobile.includes("o.quantity.toLocaleString('da-DK'"), true)
eq('enhed bliver', mobile.includes('{o.unit}'), true)
eq('total bliver', mobile.includes('fmtKr(o.total_sales_price)'), true)
eq('afkrydsning bliver', mobile.includes('toggleSet(selectedOtherCosts, setSelectedOtherCosts, o.id)'), true)
eq('manglende pris bliver', mobile.includes('Mangler salgspris'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block'), true)
eq('tom liste bliver', src.includes('Ingen ufakturerede øvrige omkostninger på sagen.'), true)

console.log(fail ? `\n${fail} fejl` : '\nbilling-other-mobile-test OK')
process.exitCode = fail ? 1 : 0
