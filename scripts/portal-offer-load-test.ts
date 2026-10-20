/** Portalens tilbud siger naar det ikke kan hentes. Ikke-fundet sender stadig til oversigten. Accept og afvis bliver. Koer: npx tsx scripts/portal-offer-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/portal.ts', 'utf8')
const start = action.indexOf('export async function getPortalOffer(')
const body = action.slice(start, action.indexOf('export async function acceptOffer'))
eq('funktionen findes', body.length > 200, true)
eq('laesefejl foer ikke-fundet', body.indexOf('if (error)') < body.indexOf("error: 'Tilbud ikke fundet'"), true)
eq('laesefejl er ikke vaek', body.includes("error: 'Kunne ikke hente tilbuddet.'"), true)
eq('ikke-fundet bliver', body.includes("error: 'Tilbud ikke fundet'"), true)
eq('erstattet bliver', body.includes('Dette tilbud er erstattet af en nyere version — se dine tilbud i oversigten'), true)
eq('kun sendte status bliver', body.includes(".in('status', ['sent', 'viewed', 'accepted', 'rejected'])"), true)

const page = fs.readFileSync('src/app/portal/[token]/offers/[id]/page.tsx', 'utf8')
eq('siden viser fejlen', page.includes('data-testid="portal-offer-load-error"') && page.includes('Det tælles ikke som at tilbuddet er væk.'), true)
eq('ikke-fundet sender hjem', page.includes("offerResult.error !== 'Tilbud ikke fundet'") && page.includes('redirect(`/portal/${token}`)'), true)

const accept = action.slice(action.indexOf('export async function acceptOffer'), action.indexOf('export async function rejectOffer'))
eq('accept bliver', accept.includes('Kunne ikke opdatere tilbud') && accept.length > 80, true)

console.log(fail ? `\n${fail} fejl` : '\nportal-offer-load-test OK')
process.exitCode = fail ? 1 : 0
