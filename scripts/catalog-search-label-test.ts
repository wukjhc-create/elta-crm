/** Materialekatalog, komponenter og tilbudstekster har et navn. Soegning og priser bliver. Koer: npx tsx scripts/catalog-search-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const read = (p: string) => fs.readFileSync(p, 'utf8')
const admin = read('src/components/modules/materials/materials-admin.tsx')
const components = read('src/app/dashboard/settings/components/components-client.tsx')
const catalog = read('src/app/dashboard/settings/kalkia/materials/materials-catalog-client.tsx')
const texts = read('src/app/dashboard/settings/kalkia/texts/offer-texts-client.tsx')
const node = read('src/app/dashboard/settings/kalkia/nodes/[id]/kalkia-node-detail-client.tsx')

eq('materialer har et navn', admin.includes('aria-label="Søg i materialenavn eller slug"') && admin.includes('placeholder="Søg i material name eller slug…"'), true)
eq('binding har et navn', admin.includes('aria-label="Søg leverandørprodukt til binding"') && admin.includes('placeholder="Søg i supplier_products (navn eller SKU)…"'), true)
eq('materialfejl bliver', admin.includes('Det tælles ikke som ingen materialer.'), true)
eq('komponenter har et navn', components.includes('aria-label="Søg efter komponenter"') && components.includes('placeholder="Søg efter komponenter..."'), true)
eq('komponentfejl bliver', components.includes('Det tælles ikke som ingen komponenter.'), true)
eq('katalog har et navn', catalog.includes('aria-label="Søg i materialekatalog"') && catalog.includes('placeholder="Søg efter navn, kode eller leverandør..."'), true)
eq('katalogfejl bliver', catalog.includes('Det tælles ikke som ingen materialer.'), true)
eq('tilbudstekster har et navn', texts.includes('aria-label="Søg i tilbudstekster"') && texts.includes('placeholder="Søg i titel eller indhold..."'), true)
eq('tekstfejl bliver', texts.includes('Det tælles ikke som ingen tekstskabeloner.'), true)
eq('node har et navn', node.includes('aria-label="Søg efter leverandørprodukt"') && node.includes('placeholder="Søg efter produkt..."'), true)
eq('nodefejl bliver', node.includes('Det tælles ikke som ingen leverandørprodukter.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncatalog-search-label-test OK')
process.exitCode = fail ? 1 : 0
