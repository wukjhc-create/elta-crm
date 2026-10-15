/** Kategorivalg siger naar listen ikke kan hentes. Et aegte tomt valg og et ukendt produkt bliver. Koer: npx tsx scripts/category-select-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const detail = fs.readFileSync('src/app/dashboard/products/[id]/page.tsx', 'utf8')
eq('ukendt produkt bliver', detail.includes("productResult.error !== 'Produktet blev ikke fundet'") && detail.includes('notFound()'), true)
eq('laese-fejl', detail.includes('data-testid="product-detail-load-error"') && detail.includes('Det tælles ikke som at produktet mangler.'), true)
eq('detalje sender kategorifejl', detail.includes("categoriesResult.success ? null : categoriesResult.error || 'Kunne ikke hente kategorier'"), true)

const form = fs.readFileSync('src/components/modules/products/product-form.tsx', 'utf8')
eq('formular banner', form.includes('data-testid="product-form-categories-error"') && form.includes('Det tælles ikke som ingen kategorier.'), true)
eq('vaelg kategori bliver', form.includes('Vælg kategori'), true)

const list = fs.readFileSync('src/app/dashboard/packages/page.tsx', 'utf8')
const view = fs.readFileSync('src/app/dashboard/packages/packages-client.tsx', 'utf8')
eq('pakkeliste sender fejl', list.includes("categoriesResult.success ? null : categoriesResult.error || 'Kunne ikke hente kategorier'"), true)
eq('filter banner', view.includes('data-testid="package-list-categories-error"') && view.includes('Det tælles ikke som ingen kategorier.'), true)
eq('opret banner', view.includes('data-testid="package-create-categories-error"'), true)
eq('alle kategorier bliver', view.includes('Alle kategorier'), true)
eq('vaelg bliver', view.includes('Vælg kategori...'), true)

console.log(fail ? `\n${fail} fejl` : '\ncategory-select-load-test OK')
process.exitCode = fail ? 1 : 0
