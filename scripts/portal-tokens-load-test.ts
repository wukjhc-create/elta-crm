/** Portal-adgang siger naar listen ikke kan hentes. Opret er slaaet fra. En aekte tom liste bliver. Koer: npx tsx scripts/portal-tokens-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const portalAction = fs.readFileSync('src/lib/actions/portal.ts', 'utf8')
const portalStart = portalAction.indexOf('export async function getPortalTokens')
const portalBody = portalAction.slice(portalStart, portalAction.indexOf('export async function deactivatePortalToken'))
eq('kunde-opslag fejler lukket', portalBody.includes("error: 'Kunne ikke hente portal-adgange'"), true)

const partnerAction = fs.readFileSync('src/lib/actions/partner-portal.ts', 'utf8')
const partnerStart = partnerAction.indexOf('export async function getPartnerTokens')
const partnerBody = partnerAction.slice(partnerStart, partnerAction.indexOf('export async function deactivatePartnerToken'))
eq('partner-opslag fejler lukket', partnerBody.includes("error: 'Kunne ikke hente partner-adgange'"), true)

const page = fs.readFileSync('src/app/dashboard/customers/[id]/page.tsx', 'utf8')
eq('kunde-siden tjekker success', page.includes('tokensResult.success ? tokensResult.data || [] : []'), true)
eq('kunde-siden sender fejlen', page.includes("tokensResult.success ? null : tokensResult.error || 'Kunne ikke hente portal-adgange'"), true)
eq('partner-siden tjekker success', page.includes('partnerTokensResult.success ? partnerTokensResult.data || [] : []'), true)
eq('partner-siden sender fejlen', page.includes("partnerTokensResult.success ? null : partnerTokensResult.error || 'Kunne ikke hente partner-adgange'"), true)
eq('blind kundeliste er vaek', page.includes('portalTokens={tokensResult.data || []}'), false)
eq('blind partnerliste er vaek', page.includes('partnerTokens={partnerTokensResult.data || []}'), false)

const portal = fs.readFileSync('src/components/modules/customers/portal-access.tsx', 'utf8')
eq('kundebanner', portal.includes('data-testid="portal-tokens-load-error"') && portal.includes('Det tælles ikke som ingen portal-adgang.'), true)
eq('kunde opret er slaaet fra', portal.includes('disabled={isCreating || !!tokensError}'), true)
eq('kunde tom kraever ingen fejl', portal.includes('!tokensError && activeTokens.length === 0'), true)
eq('kunde tom bliver', portal.includes('Ingen aktiv portal-adgang') && portal.includes('Opret en adgang så kunden kan se tilbud'), true)

const partner = fs.readFileSync('src/components/modules/customers/partner-portal-access.tsx', 'utf8')
eq('partnerbanner', partner.includes('data-testid="partner-tokens-load-error"') && partner.includes('Det tælles ikke som ingen partner-adgang.'), true)
eq('partner opret er slaaet fra', partner.includes('disabled={isCreating || !!tokensError}'), true)
eq('partner tom kraever ingen fejl', partner.includes('!tokensError && activeTokens.length === 0'), true)
eq('partner tom bliver', partner.includes('Ingen aktiv partner-adgang') && partner.includes('Opret en adgang så partneren kan se alle sager'), true)

console.log(fail ? `\n${fail} fejl` : '\nportal-tokens-load-test OK')
process.exitCode = fail ? 1 : 0
