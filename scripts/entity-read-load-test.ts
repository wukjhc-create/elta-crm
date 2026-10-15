/** Kunde, tilbud, lead, komponent, projekt og leverandoer siger naar laesningen fejler. Et aegte ukendt id bliver vaek. Koer: npx tsx scripts/entity-read-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const check = (name: string, path: string, miss: string, testid: string, sentence: string) => {
  const src = fs.readFileSync(path, 'utf8')
  eq(`${name} ukendt bliver`, src.includes(miss) && src.includes('notFound()'), true)
  eq(`${name} laese-fejl`, src.includes(`data-testid="${testid}"`) && src.includes(sentence), true)
}

check('kunde', 'src/app/dashboard/customers/[id]/page.tsx', "customerResult.error !== 'Kunden blev ikke fundet'", 'customer-detail-load-error', 'Det tælles ikke som at kunden mangler.')
check('tilbud', 'src/app/dashboard/offers/[id]/page.tsx', "offerResult.error !== 'Tilbuddet blev ikke fundet'", 'offer-detail-load-error', 'Det tælles ikke som at tilbuddet mangler.')
check('lead', 'src/app/dashboard/leads/[id]/page.tsx', "leadResult.error !== 'Lead blev ikke fundet'", 'lead-detail-load-error', 'Det tælles ikke som at leadet mangler.')
check('komponent', 'src/app/dashboard/settings/components/[id]/page.tsx', "result.error !== 'Komponenten blev ikke fundet'", 'component-detail-load-error', 'Det tælles ikke som at komponenten mangler.')
check('projekt', 'src/app/dashboard/projects/[id]/page.tsx', "result.error !== 'Projektet blev ikke fundet'", 'project-detail-load-error', 'Det tælles ikke som at projektet mangler.')
check('leverandoer', 'src/app/dashboard/settings/suppliers/[id]/page.tsx', "result.error !== 'Leverandøren blev ikke fundet'", 'supplier-detail-load-error', 'Det tælles ikke som at leverandøren mangler.')
check('import', 'src/app/dashboard/settings/suppliers/[id]/import/page.tsx', "result.error !== 'Leverandøren blev ikke fundet'", 'supplier-import-load-error', 'Det tælles ikke som at leverandøren mangler.')
check('produkter', 'src/app/dashboard/settings/suppliers/[id]/products/page.tsx', "result.error !== 'Leverandøren blev ikke fundet'", 'supplier-products-load-error', 'Det tælles ikke som at leverandøren mangler.')

const supplier = fs.readFileSync('src/app/dashboard/settings/suppliers/[id]/page.tsx', 'utf8')
eq('titel ukendt bliver', supplier.includes("return { title: 'Leverandør ikke fundet' }"), true)
eq('login bliver', supplier.includes("pageHasPermission('suppliers.credentials')"), true)

const offer = fs.readFileSync('src/app/dashboard/offers/[id]/page.tsx', 'utf8')
eq('taerskler bliver', offer.includes('db_green_threshold') && offer.includes('db_red_threshold'), true)

console.log(fail ? `\n${fail} fejl` : '\nentity-read-load-test OK')
process.exitCode = fail ? 1 : 0
