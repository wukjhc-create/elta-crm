/**
 * Sprint Ø9.6 — statiske sikkerheds-/adskillelses-assertions.
 *
 * Verificerer at indkøbsdrift-siden (filtre + pagination):
 *   - er gated bag incoming_invoices.view (server action + side via NoAccess)
 *   - kun viser interne beløb bag economy.cost_prices (defense-in-depth)
 *   - er READ-ONLY (ingen INSERT/UPDATE/DELETE/UPSERT/RPC i sprintets action)
 *   - IKKE lækker salgspris/margin/DB
 *   - IKKE eksponerer rå storage-URL/file_url/receipt_url/signedUrl/raw_text/file_name
 *   - IKKE har portal/public/anon/token-adgang
 *   - input valideres (clamp/whitelist af reason/sort/pageSize/search)
 *
 * Kør:  npx tsx scripts/assert-oe9-6-security.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

let failures = 0, passes = 0
function assert(cond: boolean, msg: string) { if (cond) { passes++; console.log(`  ✅ ${msg}`) } else { failures++; console.log(`  ❌ ${msg}`) } }

const ACTION = 'src/lib/actions/purchase-operations.ts'
const PAGE = 'src/app/dashboard/purchase-operations/page.tsx'
const CLIENT = 'src/app/dashboard/purchase-operations/purchase-operations-client.tsx'
const WIDGET = 'src/components/modules/dashboard/purchase-operations-widget.tsx'
const DASH = 'src/app/dashboard/page.tsx'

const actionSrc = read(ACTION)
const pageSrc = read(PAGE)
const clientSrc = read(CLIENT)
const widgetSrc = read(WIDGET)
const dashSrc = read(DASH)

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const actionCode = stripComments(actionSrc)

console.log('\n=== ASSERT Ø9.6: sikkerhed & intern økonomiadskillelse ===\n')

console.log('Server action:')
assert(/getPurchaseOperationsPageAction/.test(actionCode), 'getPurchaseOperationsPageAction findes')
assert(/hasPermission\(\s*['"]incoming_invoices\.view['"]\s*\)/.test(actionCode), 'gated bag incoming_invoices.view')
assert(/Manglende tilladelse: incoming_invoices\.view/.test(actionSrc), 'afvisning uden data ved manglende tilladelse')
assert(/hasPermission\(\s*['"]economy\.cost_prices['"]\s*\)/.test(actionCode), 'interne beløb gated bag economy.cost_prices')
assert(/canViewAmounts\s*\?\s*r2\(/.test(actionCode), 'beløb nulles uden kost-permission')

// Read-only.
for (const mut of ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']) {
  assert(!actionCode.includes(mut), `read-only: ingen "${mut}" i action`)
}
assert(!/convertAndApprove|approveIncomingInvoice|WithConversion/.test(actionCode), 'ingen konverterings-/godkendelseskald')
assert(/internal_purchase:\s*true/.test(actionCode), 'payload markeret internal_purchase: true')

// Input-validering (defense).
assert(/REASON_VALUES\.includes/.test(actionCode), 'reason whitelistes')
assert(/SORT_VALUES\.includes/.test(actionCode), 'sort whitelistes')
assert(/Math\.min\(PAGE_SIZE_MAX/.test(actionCode) && /Math\.max\(PAGE_SIZE_MIN/.test(actionCode), 'pageSize clampes (min/max)')
assert(/slice\(0,\s*SEARCH_MAX_LEN\)/.test(actionCode), 'search trunkeres (max-længde)')

// Ingen salg/margin/DB.
for (const f of ['sales_price', 'unit_sales_price', 'total_sales', 'margin', 'contribution', 'daekningsbidrag', 'dækningsbidrag', 'avance']) {
  assert(!actionCode.includes(f), `ingen salgs-/margin-felt: "${f}"`)
}
// Ingen storage/fil/raw.
for (const f of ['getPublicUrl', 'file_url', 'receipt_url', 'signedUrl', 'createSignedUrl', 'storage.from', 'file_name', 'raw_text']) {
  assert(!actionCode.includes(f), `ingen storage-/fil-eksponering: "${f}"`)
}
// Ingen portal/public/anon.
for (const f of ['portal_access_tokens', 'anonKey', 'ANON_KEY', 'createPublic']) {
  assert(!actionSrc.includes(f), `ingen public/anon-adgang: "${f}"`)
}
assert(/\/dashboard\/orders\//.test(actionCode) && /\/dashboard\/incoming-invoices\//.test(actionCode), 'links peger på interne routes')

console.log('\nUI — side + widget:')
assert(/incoming_invoices\.view/.test(pageSrc) && /NoAccess/.test(pageSrc), 'side gated bag incoming_invoices.view (NoAccess)')
assert(/Suspense/.test(pageSrc), 'side wrapper klient i Suspense (useSearchParams)')
assert(/canViewIncoming && <PurchaseOperationsWidget/.test(dashSrc), 'widget mountet bag canViewIncoming')
assert(/can_view_amounts/.test(clientSrc), 'beløbskolonne betinget af can_view_amounts')
for (const f of ['getPublicUrl', 'receipt_url', 'file_url', 'signedUrl', 'portal', 'token']) {
  assert(!clientSrc.includes(f) && !widgetSrc.includes(f), `UI uden ${f}-eksponering`)
}
assert(/ikke kundevendt/i.test(clientSrc), 'side markerer: ikke kundevendt')

console.log(`\n=== RESULTAT: ${passes} bestået, ${failures} fejlet ===\n`)
process.exit(failures > 0 ? 1 : 0)
