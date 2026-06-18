/**
 * Sprint Ø9.3 — statiske sikkerheds-/adskillelses-assertions.
 *
 * Verificerer i kildekoden at den interne indkøbsøkonomi:
 *   - er gated bag economy.cost_prices (intern kost-gate)
 *   - IKKE lækker salgspris/margin/dækningsbidrag i payloaden
 *   - IKKE eksponerer rå storage-URL'er (file_url/receipt_url/getPublicUrl)
 *   - IKKE har portal/public/anon/token-adgang
 *   - kun er monteret bag canSeeCost i sagsdetalje-UI'et
 *   - markerer kortet tydeligt som intern (ikke kundevendt)
 *
 * Kør:  npx tsx scripts/assert-oe9-3-security.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

let failures = 0
let passes = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passes++; console.log(`  ✅ ${msg}`) }
  else { failures++; console.log(`  ❌ ${msg}`) }
}

const ACTION = 'src/lib/actions/service-case-economy.ts'
const CARD = 'src/components/modules/orders/case-purchase-summary-card.tsx'
const DETAIL = 'src/app/dashboard/orders/[id]/order-detail-client.tsx'

const actionSrc = read(ACTION)
const cardSrc = read(CARD)
const detailSrc = read(DETAIL)

// Isolér purchase-summary-funktionsblokken (fra interface til filslut).
const fnStart = actionSrc.indexOf('export interface CasePurchaseSummary')
const fnSlice = fnStart >= 0 ? actionSrc.slice(fnStart) : ''
// Kommentar-strippet udgave til felt-scanning — så ord som "margin" i en
// "IKKE margin"-kommentar ikke giver falske positiver. Vi tjekker for
// FAKTISKE salgs-/margin-felter i koden, ikke i dokumentationen.
const stripComments = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const fnCode = stripComments(fnSlice)

console.log('\n=== ASSERT Ø9.3: sikkerhed & intern økonomiadskillelse ===\n')

console.log('Server action (data-lag):')
assert(fnSlice.length > 0, 'fandt CasePurchaseSummary-blokken i action-filen')
assert(/getServiceCasePurchaseSummary/.test(fnSlice), 'getServiceCasePurchaseSummary findes')
assert(/hasPermission\(\s*['"]economy\.cost_prices['"]\s*\)/.test(fnSlice), 'gated bag economy.cost_prices (intern kost-gate)')
assert(/Manglende tilladelse: economy\.cost_prices/.test(fnSlice), 'returnerer afvisnings-besked uden data ved manglende tilladelse')

// Ingen salg/margin i den interne payload (scannet på kommentar-strippet kode).
for (const forbidden of ['sales_price', 'unit_sales_price', 'total_sales', 'margin', 'contribution', 'daekningsbidrag', 'dækningsbidrag', 'dbg', 'avance']) {
  assert(!fnCode.includes(forbidden), `ingen salgs-/margin-felt i payload: "${forbidden}"`)
}
// Markør på at det er intern indkøb.
assert(/internal_purchase:\s*true/.test(fnSlice), 'payload markeret internal_purchase: true')

// Ingen rå storage-URL / fil-eksponering i indkøbs-payloaden.
for (const forbidden of ['getPublicUrl', 'file_url', 'receipt_url', 'signedUrl', 'createSignedUrl', 'storage.from']) {
  assert(!fnCode.includes(forbidden), `ingen storage-URL-eksponering: "${forbidden}"`)
}

// Ingen portal/public/anon/token i action-filen som helhed (denne action er intern).
for (const forbidden of ['portal_access_tokens', 'createPublic', 'anonKey', 'ANON_KEY']) {
  assert(!actionSrc.includes(forbidden), `ingen public/anon-adgang i action-fil: "${forbidden}"`)
}

console.log('\nUI-kort:')
assert(/economy\.cost_prices|Intern kost|Intern indkøb/i.test(cardSrc), 'kortet markerer intern indkøbsøkonomi tydeligt')
assert(/ikke dækningsbidrag eller margin/i.test(cardSrc), 'kortet forklarer: ikke dækningsbidrag/margin')
for (const forbidden of ['getPublicUrl', 'receipt_url', 'file_url', 'signedUrl', 'portal', 'token']) {
  assert(!cardSrc.includes(forbidden), `kort uden ${forbidden}-eksponering`)
}

console.log('\nMontering i sagsdetalje:')
// Kortet må kun renderes i den kost-gatede Økonomi-fane.
const mountIdx = detailSrc.indexOf('CasePurchaseSummaryCard caseId')
assert(mountIdx >= 0, 'CasePurchaseSummaryCard er monteret i sagsdetaljen')
const ctx = detailSrc.slice(Math.max(0, mountIdx - 400), mountIdx)
assert(/active === 'oekonomi' && canSeeCost/.test(ctx), 'kun monteret bag (oekonomi-fane && canSeeCost)')

console.log(`\n=== RESULTAT: ${passes} bestået, ${failures} fejlet ===\n`)
process.exit(failures > 0 ? 1 : 0)
