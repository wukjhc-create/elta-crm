/**
 * Sprint Ø9.7 — statiske sikkerheds-/adskillelses-assertions.
 *
 * Verificerer at de nye inline konvertér-handlinger i indkøbsdriften:
 *   - genbruger Ø9.2-flowet (samme per-linje-logik via runLineConversion) — ingen
 *     parallel regel
 *   - er gated bag BÅDE incoming_invoices.approve OG materials.add_to_case i begge
 *     lag (server action + side)
 *   - har en konverter-KUN sti for godkendt/bogført der IKKE flipper status
 *   - bevarer den økonomiske adskillelse (interne beløb bag economy.cost_prices)
 *   - IKKE lækker salgspris/margin
 *
 * Kør:  npx tsx scripts/assert-oe9-7-security.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

let failures = 0, passes = 0
function assert(cond: boolean, msg: string) { if (cond) { passes++; console.log(`  ✅ ${msg}`) } else { failures++; console.log(`  ❌ ${msg}`) } }

/** Udsnit fra en funktions start til næste top-level `export ` (eller EOF). */
function fnSlice(src: string, marker: string): string {
  const start = src.indexOf(marker)
  if (start < 0) return ''
  const after = src.indexOf('\nexport ', start + marker.length)
  return src.slice(start, after < 0 ? src.length : after)
}

const ENGINE = 'src/lib/services/incoming-invoice-conversion.ts'
const ACTION = 'src/lib/actions/incoming-invoices.ts'
const PAGE = 'src/app/dashboard/purchase-operations/page.tsx'
const CLIENT = 'src/app/dashboard/purchase-operations/purchase-operations-client.tsx'

const engineSrc = read(ENGINE)
const actionSrc = read(ACTION)
const pageSrc = read(PAGE)
const clientSrc = read(CLIENT)

console.log('\n=== ASSERT Ø9.7: inline konvertér — gating & adskillelse ===\n')

console.log('Motor (incoming-invoice-conversion.ts):')
assert(/async function runLineConversion\(/.test(engineSrc), 'delt helper runLineConversion findes')
assert((engineSrc.match(/runLineConversion\(/g) || []).length >= 3, 'runLineConversion kaldes af begge stier (def + 2 kald)')
assert(/export async function convertApprovedInvoiceLines\(/.test(engineSrc), 'konverter-kun sti convertApprovedInvoiceLines eksporteret')

const convertOnly = fnSlice(engineSrc, 'export async function convertApprovedInvoiceLines(')
assert(/convertibleStatuses\s*=\s*\[\s*['"]approved['"]\s*,\s*['"]posted['"]\s*\]/.test(convertOnly), 'status-gate: kun approved/posted')
assert(!/status:\s*['"]approved['"]/.test(convertOnly), 'konverter-kun flipper IKKE status (ingen status:approved)')
assert(/invoiceStatusFlipped:\s*false/.test(convertOnly) && !/invoiceStatusFlipped:\s*true/.test(convertOnly), 'konverter-kun returnerer altid invoiceStatusFlipped:false')

console.log('\nServer action (incoming-invoices.ts):')
const act = fnSlice(actionSrc, 'export async function convertIncomingInvoiceLinesAction(')
assert(act.length > 0, 'convertIncomingInvoiceLinesAction findes')
assert(/hasPermission\(\s*['"]incoming_invoices\.approve['"]\s*\)/.test(act), 'gated bag incoming_invoices.approve')
assert(/hasPermission\(\s*['"]materials\.add_to_case['"]\s*\)/.test(act), 'gated bag materials.add_to_case')
assert(/Manglende tilladelse: incoming_invoices\.approve/.test(act), 'afviser uden approve-tilladelse')
assert(/Manglende tilladelse: materials\.add_to_case/.test(act), 'afviser uden add_to_case-tilladelse')
assert(/convertApprovedInvoiceLines\(/.test(act), 'kalder den nye konverter-kun motor-sti')
assert(!/insert\(|\.upsert\(/.test(act), 'action laver ingen direkte INSERT/UPSERT (kun via motor)')

console.log('\nSide (page.tsx):')
assert(/pageHasPermission\(\s*['"]incoming_invoices\.approve['"]\s*\)/.test(pageSrc), 'side tjekker incoming_invoices.approve')
assert(/pageHasPermission\(\s*['"]materials\.add_to_case['"]\s*\)/.test(pageSrc), 'side tjekker materials.add_to_case')
assert(/canConvert\s*=[\s\S]*incoming_invoices\.approve[\s\S]*materials\.add_to_case/.test(pageSrc), 'canConvert kræver BEGGE rettigheder')
assert(/canConvert=\{canConvert\}/.test(pageSrc), 'canConvert sendes til klienten')

console.log('\nKlient (purchase-operations-client.tsx):')
assert(/approveIncomingInvoiceWithConversionAction/.test(clientSrc), 'genbruger Ø9.2 convert+approve (received/awaiting)')
assert(/convertIncomingInvoiceLinesAction/.test(clientSrc), 'bruger konverter-kun (approved/posted)')
assert(/isApproveMode\s*=[\s\S]*received[\s\S]*awaiting_approval/.test(clientSrc), 'dispatch efter status (received/awaiting → approve-mode)')
assert(/mode=\{isApproveMode \? ['"]approve['"] : ['"]convert_only['"]\}/.test(clientSrc), 'dialog-mode udledt af status')
assert(/showConvert\s*=\s*canConvert\s*&&\s*[A-Za-z.]*can_view_amounts/.test(clientSrc), 'konvertér-knap gated bag canConvert && can_view_amounts')
assert(/getServiceCaseUnconvertedSupplierLinesAction/.test(clientSrc), 'udfoldning genbruger Ø9.4-action (kost-gatet)')

// Ingen salg/margin i klienten.
for (const f of ['unit_sales_price', 'total_sales', 'margin', 'contribution', 'dækningsbidrag', 'avance']) {
  assert(!clientSrc.includes(f), `klient lækker ikke salgs-/margin-felt: "${f}"`)
}
assert(/ikke kundevendt/i.test(clientSrc), 'klient markerer: ikke kundevendt')

console.log(`\n=== RESULTAT: ${passes} bestået, ${failures} fejlet ===\n`)
process.exit(failures > 0 ? 1 : 0)
