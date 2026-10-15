/** Tilknyttede fuldmagter skjules ikke som tomme naar opslaget fejler. Egne dokumenter bliver. CPR udleveres ikke naar signeren ikke kan slaas op. Koer: npx tsx scripts/portal-fuldmagt-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/fuldmagt.ts', 'utf8')
const start = action.indexOf('export async function getPortalFuldmagter')
const body = action.slice(start, action.indexOf('export async function submitSignedFuldmagt'))
eq('funktionen findes', body.length > 200, true)
eq('sagsfejl er ikke ingen sager', body.includes('error: signerErr') && body.includes('linkedFailed = true'), true)
eq('dokumentfejl er ikke ingen dokumenter', body.includes('error: ldErr') && body.includes('if (ldErr) linkedFailed = true'), true)
eq('signerfejl udleverer ikke cpr', body.indexOf('if (scId && signerLookupFailed) return false') < body.indexOf('signerByCaseId.has(scId)'), true)
eq('egne dokumenter returneres', body.includes('error: \'Kunne ikke hente alle fuldmagter.\'') && body.includes('data: fuldmagter'), true)
eq('aegte succes bliver', body.includes('return { success: true, data: fuldmagter }'), true)
eq('underskrift bliver', action.includes('export async function submitSignedFuldmagt'), true)

const page = fs.readFileSync('src/app/portal/[token]/page.tsx', 'utf8')
eq('siden beholder data', page.includes('fuldmagter={fuldmagterResult.data || []}'), true)

const view = fs.readFileSync('src/components/modules/portal/portal-fuldmagt.tsx', 'utf8')
eq('delvis fejl vises', view.includes('data-testid="portal-fuldmagt-partial-error"') && view.includes('Egne dokumenter er vist.'), true)
eq('tom fejl bliver', view.includes('Det tælles ikke som ingen fuldmagter.'), true)
eq('aegte tom skjules', view.includes('if (fuldmagter.length === 0) return null'), true)
eq('fuldmagtstekst bliver', view.includes('Undertegnede giver hermed'), true)

console.log(fail ? `\n${fail} fejl` : '\nportal-fuldmagt-load-test OK')
process.exitCode = fail ? 1 : 0
