/** Hurtig kalkulation siger naar skabeloner, rumtyper eller komponenter ikke kan hentes. Et aegte tomt rum bliver. Koer: npx tsx scripts/quick-calc-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/calculations/quick/page.tsx', 'utf8')
eq('skabelonfejl', page.includes("templatesError={templatesResult.success ? null : templatesResult.error || 'Kunne ikke hente projektskabeloner'}"), true)
eq('rumfejl', page.includes("roomTypesError={roomTypesResult.success ? null : roomTypesResult.error || 'Kunne ikke hente rumtyper'}"), true)
eq('komponentfejl', page.includes("componentsError={componentsResult.success ? null : componentsResult.error || 'Kunne ikke hente komponenter'}"), true)
eq('aegte lister bliver', page.includes('templatesResult.success && templatesResult.data ? templatesResult.data : []'), true)
eq('indstillinger bliver', page.includes('settingsResult.success && settingsResult.data ? settingsResult.data : null'), true)

const view = fs.readFileSync('src/app/dashboard/calculations/quick/quick-calculation-client.tsx', 'utf8')
eq('skabelonbanner', view.includes('data-testid="quick-templates-load-error"') && view.includes('Det tælles ikke som ingen projekttyper.'), true)
eq('rumbanner', view.includes('data-testid="quick-rooms-load-error"') && view.includes('Det tælles ikke som ingen rumtyper.'), true)
eq('komponentbanner', view.includes('data-testid="quick-components-load-error"') && view.includes('Det tælles ikke som ingen komponenter.'), true)
eq('tomt rum bliver', view.includes('Ingen rum tilføjet endnu'), true)
eq('tilfoej-tekst bliver', view.includes('Tilføj rum med knapperne ovenfor'), true)
eq('loen bliver', view.includes('settings?.hourly_rates?.electrician || CALC_DEFAULTS.HOURLY_RATES.ELECTRICIAN'), true)
eq('laerling bliver', view.includes('settings?.hourly_rates?.apprentice || CALC_DEFAULTS.HOURLY_RATES.APPRENTICE'), true)

console.log(fail ? `\n${fail} fejl` : '\nquick-calc-load-test OK')
process.exitCode = fail ? 1 : 0
