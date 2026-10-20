/** Kalkia-link: fejlet soegning er ikke "ingen produkter". Kost og link bliver. Koer: npx tsx scripts/supplier-options-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/kalkia/nodes/[id]/kalkia-node-detail-client.tsx', 'utf8')
const openAt = src.indexOf('const handleOpenLinkDialog')
const searchAt = src.indexOf('const handleSearch')
const linkAt = src.indexOf('const handleLinkProduct')
const open = src.slice(openAt, searchAt)
const search = src.slice(searchAt, linkAt)

eq('aaben rydder forrige', open.includes('setSupplierOptions([])') && open.includes('setSupplierSearchError(null)'), true)
eq('aaben ignorerer gammel svar', open.includes('if (seq !== searchSeq.current) return'), true)
eq('aaben fejl er ikke tom liste', open.includes("setSupplierSearchError(result.success ? null : (result.error || 'Kunne ikke hente leverandørmuligheder'))"), true)
eq('soegning under to tegn rydder', search.includes('query.length < 2') && search.includes('setSupplierSearchError(null)'), true)
eq('soegning ignorerer gammel svar', search.includes('if (seq !== searchSeq.current) return'), true)
eq('soegning fejl rydder raekker', search.includes('setSupplierOptions([])') && search.includes("setSupplierSearchError(result.success ? null : (result.error || 'Kunne ikke hente leverandørmuligheder'))"), true)
eq('fejlen siges', src.includes('data-testid="supplier-options-load-error"') && src.includes('Det tælles ikke som ingen leverandørprodukter.'), true)
eq('aegte tom liste bliver', src.includes('!supplierSearchError && searchQuery.length >= 2') && src.includes('Ingen leverandørprodukter fundet'), true)
eq('kost bliver', src.includes("formatCurrency(option.cost_price, 'DKK', 2)"), true)
eq('link bliver', src.includes('handleLinkProduct(option.supplier_product_id, false)'), true)

console.log(fail ? `\n${fail} fejl` : '\nsupplier-options-load-test OK')
process.exitCode = fail ? 1 : 0
