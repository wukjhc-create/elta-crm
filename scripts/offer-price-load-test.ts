/** Leverandørpristjek siger naar hentningen fejler. Tom liste, tilladelse og procent bliver. Koer: npx tsx scripts/offer-price-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const ui = fs.readFileSync('src/components/modules/offers/offer-supplier-price-changes.tsx', 'utf8')
const action = fs.readFileSync('src/lib/actions/offers.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getOfferSupplierPriceChanges'), action.indexOf('export async function refreshLineItemPrice'))

eq('kast siges', ui.includes("setLoadError('Kunne ikke tjekke leverandørpriser')"), true)
eq('ikke uændret', ui.includes('Det tælles ikke som uændrede priser.'), true)
eq('tilladelse skjules', ui.includes("res.error?.includes('Manglende tilladelse')") && ui.includes('setRows([])'), true)
eq('tom liste bliver', ui.includes('if (!rows.length) return null'), true)
eq('beloeb bliver', ui.includes('kr(r.oldCost)') && ui.includes('kr(r.newCost)') && ui.includes('data-testid="supplier-price-delta"'), true)
eq('opdater bliver', ui.includes('data-testid="supplier-price-refresh"') && ui.includes('Sendte tilbud ændres ikke.'), true)
eq('beskrivelse ombrydes', ui.includes('min-w-0 break-words">{r.description}'), true)
eq('klippes ikke', ui.includes('truncate'), false)
eq('opdater-kast aendrer ikke pris', ui.includes('Kunne ikke opdatere. Prisen er ikke ændret.'), true)
eq('produktfejl siges', fn.includes("if (spErr) return { success: false, error: 'Kunne ikke hente leverandørpriser' }"), true)
eq('graense bliver', fn.includes('Math.abs(deltaPct) >= 0.5'), true)
eq('nul kost springes over', fn.includes('if (!(oldCost > 0) || !(newCost > 0)) continue'), true)
eq('tilladelse i action bliver', fn.includes("return { success: false, error: 'Manglende tilladelse: offers.view.cost_prices' }"), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-price-load-test OK')
process.exitCode = fail ? 1 : 0
