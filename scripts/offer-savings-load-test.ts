/** Grossist-sammenligning siger naar opslaget fejler. Et aegte tomt svar og priserne bliver. Koer: npx tsx scripts/offer-savings-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke sammenligne grossister. Det tælles ikke som ingen besparelse.'
const action = fs.readFileSync('src/lib/actions/profit.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getCheaperAlternativesForOffer'))
eq('funktion findes', fn.includes('findCheaperAlternatives'), true)
eq('linjer siger fejl', fn.includes(msg), true)
eq('linjefejl foer tom', fn.indexOf('if (itemsError)') < fn.indexOf('if (!lines.length) return { success: true, data: [] }'), true)
eq('egen vare siger fejl', fn.includes('if (ownError)'), true)
eq('alternativ siger fejl', fn.includes('if (altsError)'), true)
eq('uden ean bliver tom', fn.includes('if (!eans.length) return { success: true, data: [] }'), true)
eq('ean-variant bliver', fn.includes('`0${e}`'), true)
eq('kost over 0 bliver', fn.includes(".gt('cost_price', 0)"), true)
eq('kostvalg bliver', fn.includes('Number(i.supplier_cost_price_at_creation ?? 0) > 0'), true)
eq('uden ret bliver', fn.includes("error: 'Manglende tilladelse: offers.view.cost_prices'"), true)

const view = fs.readFileSync('src/components/modules/offers/offer-supplier-savings-card.tsx', 'utf8')
eq('kort siger fejl', view.includes('data-testid="offer-supplier-savings-error"') && view.includes(msg), true)
eq('fejl rydder ikke listen', view.includes('if (r.success && r.data)') && !view.includes('setAlts([])'), true)
eq('aegte tom skjules', view.includes('if (!alts || alts.length === 0) return null'), true)
eq('besparelse bliver', view.includes('Mulig besparelse'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-savings-load-test OK')
process.exitCode = fail ? 1 : 0
