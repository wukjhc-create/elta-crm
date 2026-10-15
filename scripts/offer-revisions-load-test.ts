/** En fejlet revisionskaede er ikke ingen revisioner. Flag-tomheden og den aegte tomme tekst bliver. Koer: npx tsx scripts/offer-revisions-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/lib/offers/revisions.ts', 'utf8')
const start = src.indexOf('export async function getRevisionHistory')
const fn = src.slice(start)
eq('funktion findes', start > 0, true)
eq('flag-tom bliver foerst', fn.indexOf('if (!offerRevisionsEnabled()) return []') < fn.indexOf("throw new Error('Kunne ikke hente revisioner')"), true)
eq('fire laesefejl', fn.split("throw new Error('Kunne ikke hente revisioner')").length - 1 === 4, true)
eq('rodfejl foer kaeden', fn.indexOf('if (error) throw new Error') < fn.indexOf('chain.push'), true)
eq('naeste fejl foer skift', fn.indexOf('if (nextRes.error)') < fn.indexOf('cur = (nextRes.data'), true)
eq('tom kaede bliver tom', fn.indexOf('if (chain.length === 0) return []') < fn.indexOf("from('offer_snapshots')"), true)
eq('snapshotfejl foer datoer', fn.indexOf('if (snapErr)') < fn.indexOf('new Map'), true)

const view = fs.readFileSync('src/components/modules/offers/offer-revisions-panel.tsx', 'utf8')
const banner = 'Revisioner kunne ikke hentes. Det tælles ikke som ingen revisioner.'
eq('banneret siger det', view.includes('data-testid="offer-revisions-load-error"') && view.includes(banner), true)
eq('banner foer ingen', view.indexOf('offer-revisions-load-error') < view.indexOf('Ingen revisioner endnu'), true)
eq('aegte tom bliver', view.includes('Ingen revisioner endnu — det sendte indhold gemmes uforanderligt ved afsendelse.'), true)
eq('opret bliver', view.includes('createOfferRevisionAction(offerId)'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\noffer-revisions-load-test OK')
process.exitCode = fail ? 1 : 0
