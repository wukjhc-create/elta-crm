/** Revisionsraekken ombryder nummer og status. Historiktekst og opret bliver. Koer: npx tsx scripts/offer-revisions-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const view = fs.readFileSync('src/components/modules/offers/offer-revisions-panel.tsx', 'utf8')
const start = view.indexOf('revs.map')
const end = view.indexOf('Ingen revisioner endnu')
const row = view.slice(start, end)
eq('raekke findes', start > 0 && end > start, true)
eq('raekken kan ombryde', row.includes('flex-wrap') && row.includes('min-w-0'), true)
eq('nummer ombrydes', row.includes('break-words min-w-0'), true)
eq('status ombrydes', row.includes('text-gray-500 break-words min-w-0'), true)
eq('link bliver', row.includes('href={`/dashboard/offers/${r.id}`}'), true)
eq('opret bliver', view.includes('createOfferRevisionAction(offerId)'), true)
eq('tom tekst bliver', view.includes('Ingen revisioner endnu — det sendte indhold gemmes uforanderligt ved afsendelse.'), true)
eq('afloest ombrydes', view.includes('data-testid="offer-superseded"') && view.includes('bg-amber-50 rounded px-3 py-2 break-words'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\noffer-revisions-wrap-test OK')
process.exitCode = fail ? 1 : 0
