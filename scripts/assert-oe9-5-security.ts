/**
 * Sprint Ø9.5 — statiske sikkerheds-/adskillelses-assertions.
 *
 * Verificerer i kildekoden at det porteføljevidte indkøbsdrift-overblik:
 *   - er gated bag incoming_invoices.view (server action + side)
 *   - kun viser interne beløb bag economy.cost_prices (defense-in-depth)
 *   - IKKE lækker salgspris/margin/DB
 *   - IKKE eksponerer rå storage-URL/file_url/receipt_url/signedUrl/raw_text
 *   - IKKE har portal/public/anon/token-adgang
 *   - er READ-ONLY (ingen INSERT/UPDATE/DELETE/upsert i sprintets action)
 *   - widget + side er gated i UI
 *   - markerer overblikket som intern (ikke kundevendt)
 *
 * Kør:  npx tsx scripts/assert-oe9-5-security.ts
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

const ACTION = 'src/lib/actions/purchase-operations.ts'
const WIDGET = 'src/components/modules/dashboard/purchase-operations-widget.tsx'
const PAGE = 'src/app/dashboard/purchase-operations/page.tsx'
const CLIENT = 'src/app/dashboard/purchase-operations/purchase-operations-client.tsx'
const DASH = 'src/app/dashboard/page.tsx'

const actionSrc = read(ACTION)
const widgetSrc = read(WIDGET)
const pageSrc = read(PAGE)
const clientSrc = read(CLIENT)
const dashSrc = read(DASH)

const stripComments = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const actionCode = stripComments(actionSrc)

console.log('\n=== ASSERT Ø9.5: sikkerhed & intern økonomiadskillelse ===\n')

console.log('Server action:')
assert(/getPurchaseOperationsDashboardAction/.test(actionCode), 'getPurchaseOperationsDashboardAction findes')
assert(/hasPermission\(\s*['"]incoming_invoices\.view['"]\s*\)/.test(actionCode), 'gated bag incoming_invoices.view')
assert(/Manglende tilladelse: incoming_invoices\.view/.test(actionSrc), 'afvisning uden data ved manglende tilladelse')
assert(/hasPermission\(\s*['"]economy\.cost_prices['"]\s*\)/.test(actionCode), 'interne beløb gated bag economy.cost_prices')
assert(/canViewAmounts\s*\?\s*r2\(/.test(actionCode), 'beløb nulles uden kost-permission (canViewAmounts ? ... : null)')

// Read-only: ingen data-mutationer.
for (const mut of ['.insert(', '.update(', '.delete(', '.upsert(']) {
  assert(!actionCode.includes(mut), `read-only: ingen "${mut}" i action`)
}
// Ø9.7: RPC tilladt, men KUN den ene read-only aggregerings-funktion.
const rpcCalls = (actionCode.match(/\.rpc\(\s*['"]([a-z_]+)['"]/g) ?? [])
assert(rpcCalls.length === 0 || rpcCalls.every((c) => /get_purchase_operations_page/.test(c)), 'KUN get_purchase_operations_page kaldes via .rpc (ingen andre RPC)')
// Ingen auto-konvertering / godkendelse.
assert(!/convertAndApprove|approveIncomingInvoice|WithConversion/.test(actionCode), 'ingen konverterings-/godkendelseskald')
assert(/internal_purchase:\s*true/.test(actionCode), 'payload markeret internal_purchase: true')

// Ingen salg/margin/DB.
for (const f of ['sales_price', 'unit_sales_price', 'total_sales', 'margin', 'contribution', 'daekningsbidrag', 'dækningsbidrag', 'avance']) {
  assert(!actionCode.includes(f), `ingen salgs-/margin-felt: "${f}"`)
}
// Ingen storage/fil/raw-eksponering.
for (const f of ['getPublicUrl', 'file_url', 'receipt_url', 'signedUrl', 'createSignedUrl', 'storage.from', 'file_name', 'raw_text']) {
  assert(!actionCode.includes(f), `ingen storage-/fil-eksponering: "${f}"`)
}
// Ingen portal/public/anon.
for (const f of ['portal_access_tokens', 'anonKey', 'ANON_KEY', 'createPublic']) {
  assert(!actionSrc.includes(f), `ingen public/anon-adgang: "${f}"`)
}
// Links peger på interne routes.
assert(/\/dashboard\/orders\//.test(actionCode) && /\/dashboard\/incoming-invoices\//.test(actionCode), 'links peger på interne routes (sag + faktura)')

console.log('\nUI — widget + side:')
assert(/incoming_invoices\.view/.test(pageSrc) && /NoAccess/.test(pageSrc), 'side gated bag incoming_invoices.view (NoAccess)')
assert(/canViewIncoming && <PurchaseOperationsWidget/.test(dashSrc), 'widget mountet bag canViewIncoming på dashboard')
for (const f of ['getPublicUrl', 'receipt_url', 'file_url', 'signedUrl', 'portal', 'token']) {
  assert(!widgetSrc.includes(f) && !clientSrc.includes(f), `UI uden ${f}-eksponering`)
}
assert(/ikke kundevendt/i.test(widgetSrc) || /Intern indkøb/i.test(widgetSrc), 'widget markerer intern indkøbsøkonomi')
assert(/ikke kundevendt/i.test(clientSrc), 'side markerer: ikke kundevendt')

console.log(`\n=== RESULTAT: ${passes} bestået, ${failures} fejlet ===\n`)
process.exit(failures > 0 ? 1 : 0)
