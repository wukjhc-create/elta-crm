/** Kundeprisaftaler ombrydes, og ikonerne har et navn. Koer: npx tsx scripts/customer-pricing-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-pricing.tsx', 'utf8')
const page = fs.readFileSync('src/app/dashboard/customers/[id]/page.tsx', 'utf8')

eq('tom aftale forklarer naeste skridt', src.includes('data-testid="customer-pricing-empty"') && src.includes('særlig rabat'), true)
eq('aftalen ombrydes', src.includes('flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'), true)
eq('rediger og slet siger leverandoren', src.includes('aria-label={`Rediger aftale hos ${getSupplierName(agreement.supplier_id)}`}') && src.includes('aria-label={`Slet aftale hos ${getSupplierName(agreement.supplier_id)}`}'), true)
eq('soegning har et navn', src.includes('aria-label="Søg pris"') && src.includes('aria-label="Varenummer"'), true)
eq('prisresultat ombrydes', src.includes('flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'), true)
eq('kost vises stadig i opslaget', src.includes('effective_cost_price') && src.includes('effective_sale_price'), true)
eq('slet kalder stadig handleDelete', src.includes('onClick={() => handleDelete(agreement)}'), true)
eq('siden kraever tools.pricing', page.includes("pageHasPermission('tools.pricing')"), true)
eq('leverandor er koblet', src.includes('htmlFor="customer-price-supplier"') && src.includes('id="customer-price-supplier"'), true)
eq('rabat er koblet', src.includes('htmlFor="customer-price-discount"') && src.includes('id="customer-price-discount"') && src.includes('value={discount}'), true)
eq('avance er koblet', src.includes('htmlFor="customer-price-margin"') && src.includes('id="customer-price-margin"') && src.includes('value={margin}'), true)
eq('prisliste er koblet', src.includes('htmlFor="customer-price-list"') && src.includes('id="customer-price-list"') && src.includes('value={priceListCode}'), true)
eq('gyldig fra er et datofelt', src.includes('htmlFor="customer-price-from"') && src.includes('id="customer-price-from"') && src.includes('value={validFrom}'), true)
eq('gyldig til er et datofelt', src.includes('htmlFor="customer-price-to"') && src.includes('id="customer-price-to"') && src.includes('value={validTo}'), true)
eq('noter er koblet', src.includes('htmlFor="customer-price-notes"') && src.includes('id="customer-price-notes"') && src.includes('value={notes}'), true)
eq('luk-knappen beholder navnet', src.includes('aria-label="Luk"'), true)
eq('gyldighed er stadig datofelter', (src.match(/type="date"/g) || []).length >= 2, true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-pricing-mobile-test OK')
process.exitCode = fail ? 1 : 0
