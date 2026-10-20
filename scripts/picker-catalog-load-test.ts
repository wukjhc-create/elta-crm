/** Produktvaelger og pakke-lister siger naar opslaget fejler. Et aegte tomt svar bliver. Koer: npx tsx scripts/picker-catalog-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const calcPage = fs.readFileSync('src/app/dashboard/calculations/[id]/page.tsx', 'utf8')
eq('kalkulation sender fejl', calcPage.includes("productsResult.success ? null : productsResult.error || 'Kunne ikke hente produkter'"), true)
eq('kalkulation aegte produkter', calcPage.includes('productsResult.success && productsResult.data ? productsResult.data : []'), true)

const picker = fs.readFileSync('src/components/modules/calculations/product-picker-dialog.tsx', 'utf8')
eq('vaelger banner', picker.includes('data-testid="calc-product-picker-error"') && picker.includes('Det tælles ikke som ingen produkter.'), true)
eq('aegte tom vaelger', picker.includes('Ingen produkter fundet'), true)
eq('pris bliver', picker.includes('formatCurrency(product.list_price)'), true)

const pkgPage = fs.readFileSync('src/app/dashboard/packages/[id]/page.tsx', 'utf8')
eq('pakke kategorier', pkgPage.includes("categoriesResult.success ? null : categoriesResult.error || 'Kunne ikke hente kategorier'"), true)
eq('pakke komponenter', pkgPage.includes("componentsResult.success ? null : componentsResult.error || 'Kunne ikke hente komponenter'"), true)
eq('pakke produkter', pkgPage.includes("productsResult.success ? null : productsResult.error || 'Kunne ikke hente produkter'"), true)
eq('pakke aegte lister', pkgPage.includes('categoriesResult.success && categoriesResult.data ? categoriesResult.data : []') && pkgPage.includes('productsResult.success && productsResult.data ? productsResult.data : []'), true)

const pkg = fs.readFileSync('src/app/dashboard/packages/[id]/package-detail-client.tsx', 'utf8')
eq('kategori banner', pkg.includes('data-testid="package-categories-load-error"') && pkg.includes('Det tælles ikke som ingen kategori.'), true)
eq('ingen kategori bliver', pkg.includes('Ingen kategori'), true)
eq('komponent banner', pkg.includes('data-testid="package-components-load-error"') && pkg.includes('Det tælles ikke som ingen komponenter.'), true)
eq('produkt banner', pkg.includes('data-testid="package-products-load-error"') && pkg.includes('Det tælles ikke som ingen produkter.'), true)
eq('kost bliver', pkg.includes('setCostPrice(prod.cost_price || 0)') && pkg.includes('setSalePrice(prod.list_price)'), true)

console.log(fail ? `\n${fail} fejl` : '\npicker-catalog-load-test OK')
process.exitCode = fail ? 1 : 0
