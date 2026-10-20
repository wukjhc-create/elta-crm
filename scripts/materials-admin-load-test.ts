/** Materialeadmin siger naar hentningen fejler. Tom tekst, tilladelse og kost bliver. Koer: npx tsx scripts/materials-admin-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/materials.ts', 'utf8')
const listStart = action.indexOf('export async function listMaterialsForAdmin')
const listEnd = action.indexOf('async function countOfferLineUsage')
const list = action.slice(listStart, listEnd)
eq('liste siger fejl', list.includes("return { rows: [], error: 'Kunne ikke hente materialer' }"), true)
eq('uden adgang bliver tom', list.includes('if (denied) return { rows: [], error: null }'), true)
eq('succes returnerer raekker', list.includes('}), error: null }'), true)

const catsStart = action.indexOf('export async function listMaterialCategories')
const catsEnd = action.indexOf('export interface SupplierProductPickerRow')
const cats = action.slice(catsStart, catsEnd)
eq('kategorier siger fejl', cats.includes("return { categories: [], error: 'Kunne ikke hente kategorier' }"), true)
eq('kategorier uden adgang bliver tomme', cats.includes('if (denied) return { categories: [], error: null }'), true)

const view = fs.readFileSync('src/components/modules/materials/materials-admin.tsx', 'utf8')
eq('siden siger fejl', view.includes('data-testid="materials-admin-load-error"') && view.includes('Det tælles ikke som ingen materialer.'), true)
eq('fejl skjuler den tomme tekst', view.includes('rows.length === 0 && !loadError'), true)
eq('fejl nulstiller ikke listen', view.includes('if (!list.error) setRows(list.rows)'), true)
eq('tom tekst bliver', view.includes('Ingen materialer matcher filteret.'), true)
eq('bekraeftelse bliver', view.includes('Fjern leverandør-binding fra'), true)
eq('kost bliver', view.includes('formatCurrency(sp.cost_price)'), true)

console.log(fail ? `\n${fail} fejl` : '\nmaterials-admin-load-test OK')
process.exitCode = fail ? 1 : 0
