/** Underskrift og fuldmagt kobler etiketten til feltet. Vaerdier og tekst bliver. Koer: npx tsx scripts/portal-sign-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const sign = fs.readFileSync('src/components/modules/portal/signature-dialog.tsx', 'utf8')
const nameAt = sign.indexOf('value={name}')
const nameSlice = sign.slice(Math.max(0, nameAt - 420), nameAt + 120)
eq('navn er koblet til etiketten', nameSlice.includes('htmlFor="portal-sign-name"') && nameSlice.includes('id="portal-sign-name"'), true)
eq('navnevaerdien bliver', nameSlice.includes('value={name}'), true)
eq('navn saettes stadig', nameSlice.includes('setName(e.target.value)'), true)

const emailAt = sign.indexOf('value={email}')
const emailSlice = sign.slice(Math.max(0, emailAt - 420), emailAt + 140)
eq('email er koblet til etiketten', emailSlice.includes('htmlFor="portal-sign-email"') && emailSlice.includes('id="portal-sign-email"'), true)
eq('emailvaerdien bliver', emailSlice.includes('value={email}'), true)
eq('email saettes stadig', emailSlice.includes('setEmail(e.target.value)'), true)

const padAt = sign.indexOf('width={400}')
const padSlice = sign.slice(Math.max(0, padAt - 700), padAt + 80)
eq('underskrift bruger den synlige etiket', padSlice.includes('id="portal-sign-pad-label"') && padSlice.includes('aria-labelledby="portal-sign-pad-label"'), true)
eq('underskrift har samme flade', padSlice.includes('width={400}'), true)
eq('betingelser bliver afkrydset', sign.includes('checked={acceptTerms}') && sign.includes('setAcceptTerms(e.target.checked)'), true)
eq('beloeb bliver', sign.includes('formatCurrency(offer.final_amount, currency)'), true)

const magt = fs.readFileSync('src/components/modules/portal/portal-fuldmagt.tsx', 'utf8')
const cvrAt = magt.indexOf('value={foedselsdatoCvr}')
const cvrSlice = magt.slice(Math.max(0, cvrAt - 500), cvrAt + 80)
eq('foedselsdato er koblet til etiketten', cvrSlice.includes('htmlFor="fuldmagt-cvr"') && cvrSlice.includes('id="fuldmagt-cvr"'), true)
eq('foedselsdato bliver', cvrSlice.includes('value={foedselsdatoCvr}'), true)

const signerAt = magt.indexOf('value={signerName}')
const signerSlice = magt.slice(Math.max(0, signerAt - 500), signerAt + 80)
eq('fuldt navn er koblet til etiketten', signerSlice.includes('htmlFor="fuldmagt-name"') && signerSlice.includes('id="fuldmagt-name"'), true)
eq('fuldt navn bliver', signerSlice.includes('value={signerName}'), true)

const canvasAt = magt.indexOf('width={500}')
const canvasSlice = magt.slice(Math.max(0, canvasAt - 800), canvasAt + 40)
eq('fuldmagt-underskrift bruger den synlige etiket', canvasSlice.includes('id="fuldmagt-sign-label"') && canvasSlice.includes('aria-labelledby="fuldmagt-sign-label"'), true)
eq('fuldmagtstekst bliver', magt.includes('Undertegnede giver hermed'), true)
eq('samtykke kan stadig vaelges', magt.includes('setMarketingSamtykke(true)') && magt.includes('setMarketingSamtykke(false)'), true)

console.log(fail ? `\n${fail} fejl` : '\nportal-sign-label-test OK')
process.exitCode = fail ? 1 : 0
