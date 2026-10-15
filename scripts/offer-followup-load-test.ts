/** Tilbudsopfoelgning siger naar hentningen fejler. Tom kort, tilladelse og tekster bliver. Koer: npx tsx scripts/offer-followup-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/offer-followup.ts', 'utf8')
eq('opgavefejl siger det', action.includes("if (taskError) return { success: false, error: 'Kunne ikke hente opfølgning' }"), true)
eq('manglende tilladelse bliver', action.includes("return { success: false, error: 'Manglende tilladelse: offers.view' }"), true)

const view = fs.readFileSync('src/components/modules/offers/offer-followup-card.tsx', 'utf8')
eq('kortet siger fejl', view.includes('data-testid="offer-followup-load-error"') && view.includes('Det tælles ikke som ingen opfølgning.'), true)
eq('tilladelse skjules', view.includes("r.error?.includes('Manglende tilladelse')"), true)
eq('tom succes skjuler kortet', view.includes('if (!items || items.length === 0) return null'), true)
eq('manuel tekst bliver', view.includes('Automatiske kundepåmindelser er ikke slået til — opfølgning sker manuelt herfra.'), true)
eq('sender ikke', !view.includes('sendEmail'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-followup-load-test OK')
process.exitCode = fail ? 1 : 0
