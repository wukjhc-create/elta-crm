/** Produktkataloget siger naar listen eller kategorierne ikke kan hentes. En aekte tom liste bliver. Koer: npx tsx scripts/products-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/products/page.tsx', 'utf8')
eq('siden sender listefejl', page.includes("productsResult.success ? null : productsResult.error || 'Kunne ikke hente produkter'"), true)
eq('siden sender kategorifejl', page.includes("categoriesResult.success ? null : categoriesResult.error || 'Kunne ikke hente kategorier'"), true)
eq('aegte liste bliver', page.includes('productsResult.success && productsResult.data ? productsResult.data : null'), true)

const view = fs.readFileSync('src/app/dashboard/products/products-client.tsx', 'utf8')
eq('listebanner', view.includes('data-testid="products-load-error"') && view.includes('Det tælles ikke som ingen produkter.'), true)
eq('antal er ikke 0', view.includes('Det tælles ikke som 0 produkter.'), true)
eq('tom liste kraever ingen fejl', view.includes('loadError ? (') && view.includes('products.length === 0'), true)
eq('aegte tom bliver', view.includes('Ingen produkter fundet'), true)
eq('soegning bliver', view.includes('Ingen produkter matcher søgningen'), true)
eq('kategoribanner', view.includes('data-testid="product-categories-load-error"') && view.includes('Det tælles ikke som ingen kategorier.'), true)
eq('alle kategorier bliver', view.includes('Alle kategorier'), true)

console.log(fail ? `\n${fail} fejl` : '\nproducts-load-test OK')
process.exitCode = fail ? 1 : 0
