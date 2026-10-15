/** Materialebind siger naar soegningen fejler. Tom soegning og kost bliver. Koer: npx tsx scripts/materials-bind-search-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/materials.ts', 'utf8')
const start = action.indexOf('export async function searchSupplierProductsForBinding')
const next = action.indexOf('export async function', start + 20)
const fn = action.slice(start, next === -1 ? action.length : next)
eq('funktionen findes', start >= 0 && fn.includes('supplier_products'), true)
eq('fejl er ikke tom liste', fn.includes("return { rows: [], error: 'Kunne ikke søge i leverandørprodukter' }"), true)
eq('uden adgang bliver tom', fn.includes('if (denied) return { rows: [], error: null }'), true)
eq('kort soegning bliver tom', fn.includes('if (trimmed.length < 2) return { rows: [], error: null }'), true)
eq('ingen noegen return []', fn.includes('return []'), false)
eq('kost bliver', fn.includes('cost_price: Number(r.cost_price ?? 0)'), true)

const view = fs.readFileSync('src/components/modules/materials/materials-admin.tsx', 'utf8')
eq('dialogen siger fejl', view.includes('data-testid="material-bind-search-error"') && view.includes('Det tælles ikke som ingen resultater.'), true)
eq('tom tekst bliver', view.includes('Ingen resultater.'), true)
eq('kort tekst bliver', view.includes('Skriv mindst 2 tegn for at søge.'), true)
eq('gammel soegning falder', view.includes('if (my !== searchSeq.current) return'), true)
eq('gammel soegning stopper ikke', view.includes('if (my === searchSeq.current) setSearching(false)'), true)
eq('fejl viser ikke raekker', view.includes('setResults(res.error ? [] : res.rows)'), true)

console.log(fail ? `\n${fail} fejl` : '\nmaterials-bind-search-test OK')
process.exitCode = fail ? 1 : 0
