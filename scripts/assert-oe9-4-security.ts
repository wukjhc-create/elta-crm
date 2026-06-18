/**
 * Sprint Ø9.4 — statiske sikkerheds-/adskillelses-assertions.
 *
 * Verificerer i kildekoden at det ukonverterede-linjer-overblik:
 *   - er gated bag incoming_invoices.view (server-side)
 *   - kun viser interne beløb bag economy.cost_prices (defense-in-depth)
 *   - IKKE lækker salgspris/margin/DB i payloaden
 *   - IKKE eksponerer rå storage-URL (file_url/receipt_url/getPublicUrl/signedUrl)
 *   - IKKE har portal/public/anon/token-adgang
 *   - IKKE auto-konverterer (kun read + link)
 *   - kun er monteret bag canSeeCost i sagsdetalje-UI'et
 *   - markerer kortet tydeligt som intern (ikke kundevendt)
 *
 * Kør:  npx tsx scripts/assert-oe9-4-security.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

let failures = 0, passes = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passes++; console.log(`  ✅ ${msg}`) }
  else { failures++; console.log(`  ❌ ${msg}`) }
}

const ACTION = 'src/lib/actions/service-case-economy.ts'
const CARD = 'src/components/modules/orders/case-unconverted-supplier-lines-card.tsx'
const DETAIL = 'src/app/dashboard/orders/[id]/order-detail-client.tsx'

const actionSrc = read(ACTION)
const cardSrc = read(CARD)
const detailSrc = read(DETAIL)

// Isolér Ø9.4-funktionsblokken (fra dens interface-markør til filslut).
const fnStart = actionSrc.indexOf('export interface UnconvertedSupplierInvoice')
const fnSlice = fnStart >= 0 ? actionSrc.slice(fnStart) : ''
const stripComments = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const fnCode = stripComments(fnSlice)

console.log('\n=== ASSERT Ø9.4: sikkerhed & intern økonomiadskillelse ===\n')

console.log('Server action (data-lag):')
assert(fnSlice.length > 0, 'fandt Ø9.4-blokken i action-filen')
assert(/getServiceCaseUnconvertedSupplierLinesAction/.test(fnCode), 'getServiceCaseUnconvertedSupplierLinesAction findes')
assert(/hasPermission\(\s*['"]incoming_invoices\.view['"]\s*\)/.test(fnCode), 'gated bag incoming_invoices.view (minimumsgate)')
assert(/Manglende tilladelse: incoming_invoices\.view/.test(fnSlice), 'returnerer afvisnings-besked uden data ved manglende tilladelse')
assert(/hasPermission\(\s*['"]economy\.cost_prices['"]\s*\)/.test(fnCode), 'interne beløb gated bag economy.cost_prices')
assert(/canViewAmounts\s*\?\s*r2\(/.test(fnCode), 'beløb nulles ud uden kost-permission (canViewAmounts ? ... : null)')

// Ingen salg/margin/DB i payload (kommentar-strippet kode).
for (const forbidden of ['sales_price', 'unit_sales_price', 'total_sales', 'margin', 'contribution', 'daekningsbidrag', 'dækningsbidrag', 'avance']) {
  assert(!fnCode.includes(forbidden), `ingen salgs-/margin-felt i payload: "${forbidden}"`)
}
// Ingen auto-konvertering: ingen INSERT i case_materials/case_other_costs i denne funktion.
assert(!/\.insert\(/.test(fnCode), 'ingen INSERT — read-only (ingen auto-konvertering)')
assert(!/convertAndApprove|approveIncomingInvoiceWithConversion/.test(fnCode), 'kalder ikke konverterings-/godkendelsesflow')
assert(/internal_purchase:\s*true/.test(fnCode), 'payload markeret internal_purchase: true')

// Ingen rå storage-URL / fil-eksponering.
for (const forbidden of ['getPublicUrl', 'file_url', 'receipt_url', 'signedUrl', 'createSignedUrl', 'storage.from', 'file_name', 'raw_text']) {
  assert(!fnCode.includes(forbidden), `ingen storage-/fil-eksponering: "${forbidden}"`)
}
// Link peger på intern faktura-route, ikke ekstern/public.
assert(/\/dashboard\/incoming-invoices\//.test(fnCode), 'link peger på intern faktura-route')

console.log('\nUI-kort:')
assert(/Intern kost|Intern indkøb/i.test(cardSrc), 'kortet markerer intern indkøbsøkonomi tydeligt')
assert(/ikke kundevendt/i.test(cardSrc), 'kortet forklarer: ikke kundevendt')
assert(/Alle leverandørfaktura-linjer på sagen er konverteret/.test(cardSrc), 'pæn tom-state findes')
for (const forbidden of ['getPublicUrl', 'receipt_url', 'file_url', 'signedUrl', 'portal', 'token']) {
  assert(!cardSrc.includes(forbidden), `kort uden ${forbidden}-eksponering`)
}

console.log('\nMontering i sagsdetalje:')
const mountIdx = detailSrc.indexOf('CaseUnconvertedSupplierLinesCard caseId')
assert(mountIdx >= 0, 'CaseUnconvertedSupplierLinesCard er monteret i sagsdetaljen')
const ctx = detailSrc.slice(Math.max(0, mountIdx - 600), mountIdx)
assert(/active === 'oekonomi' && canSeeCost/.test(ctx), 'kun monteret bag (oekonomi-fane && canSeeCost)')

console.log(`\n=== RESULTAT: ${passes} bestået, ${failures} fejlet ===\n`)
process.exit(failures > 0 ? 1 : 0)
