/** Tilbudstekster siger naar listen ikke kan hentes. En aekte tom liste bliver. Koer: npx tsx scripts/offer-texts-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/settings/kalkia/texts/page.tsx', 'utf8')
eq('siden sender fejl', page.includes("result.success ? null : result.error || 'Kunne ikke hente tilbudstekster'"), true)
eq('aegte liste bliver', page.includes('result.success && result.data ? result.data : []'), true)

const view = fs.readFileSync('src/app/dashboard/settings/kalkia/texts/offer-texts-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="offer-texts-load-error"') && view.includes('Det tælles ikke som ingen tekstskabeloner.'), true)
eq('tom liste kraever ingen fejl', view.includes('loadError ? (') && view.includes('filteredTemplates.length === 0 && !showCreateForm'), true)
eq('aegte tom bliver', view.includes('Ingen tekstskabeloner oprettet'), true)
eq('filter bliver', view.includes('Ingen skabeloner matcher filtrene'), true)
eq('opret-tekst bliver', view.includes('Opret skabeloner for automatisk at generere tilbudstekster'), true)
eq('slet bliver', view.includes('deleteOfferTextTemplate'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-texts-load-test OK')
process.exitCode = fail ? 1 : 0
