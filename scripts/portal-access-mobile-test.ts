/** Portal-adgangens ikoner har navne, og mailen ombrydes. Token-gate bliver. Koer: npx tsx scripts/portal-access-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const portal = fs.readFileSync('src/components/modules/customers/portal-access.tsx', 'utf8')
const partner = fs.readFileSync('src/components/modules/customers/partner-portal-access.tsx', 'utf8')

for (const [name, src] of [['kunde', portal], ['partner', partner]] as const) {
  eq(`${name} kopier har et navn`, src.includes('aria-label="Kopier link"') && src.includes('handleCopy(token.token)'), true)
  eq(`${name} aabn har et navn`, src.includes('aria-label="Åbn portal"'), true)
  eq(`${name} deaktiver har et navn`, src.includes('aria-label="Deaktiver"') && src.includes('handleDeactivate(token.id)'), true)
  eq(`${name} mail ombrydes`, src.includes('break-all min-w-0'), true)
  eq(`${name} token kun for admin`, src.includes('token.token &&'), true)
  eq(`${name} logger ikke`, src.includes('console.log'), false)
}

eq('kundelink bliver', portal.includes('getPortalUrl(token.token)'), true)
eq('partnerlink bliver', partner.includes('getPartnerUrl(token.token)'), true)
eq('kunde tom bliver', portal.includes('Opret en adgang så kunden kan se tilbud'), true)
eq('partner tom bliver', partner.includes('Opret en adgang så partneren kan se alle sager'), true)

console.log(fail ? `\n${fail} fejl` : '\nportal-access-mobile-test OK')
process.exitCode = fail ? 1 : 0
