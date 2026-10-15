/** En fejlet sags-mailhentning er ikke en tom indbakke. Koer: npx tsx scripts/case-mail-load-test.ts */
import fs from 'fs'
import { caseEmailsOrThrow, CASE_MAIL_LOAD_ERROR } from '../src/lib/mail/case-mail-load'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const rows = [{ id: 'm1' }]
eq('rækker bliver', caseEmailsOrThrow(null, rows).map((r) => r.id).join(','), 'm1')
eq('null er tom', caseEmailsOrThrow(null, null).length, 0)
let threw = ''
try {
  caseEmailsOrThrow({ message: 'db' }, null)
} catch (err) {
  threw = err instanceof Error ? err.message : 'andet'
}
eq('fejl kastes', threw, CASE_MAIL_LOAD_ERROR)

const action = fs.readFileSync('src/lib/actions/service-cases.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getEmailsForCase'), action.indexOf('export interface CaseDocument'))
eq('rettighed bliver tom', fn.includes("return []"), true)
eq('query-fejl bruger hjaelperen', fn.includes('caseEmailsOrThrow(error, null)'), true)
eq('kendt fejl sendes videre', fn.includes('CASE_MAIL_LOAD_ERROR) throw err'), true)

const view = fs.readFileSync('src/app/dashboard/orders/[id]/order-mails-tab.tsx', 'utf8')
eq('fejltekst', view.includes('Kunne ikke hente mails på sagen.'), true)
eq('ikke tom indbakke', view.includes('Det tælles ikke som en tom indbakke.'), true)
eq('tom tekst bliver', view.includes('Ingen mails koblet til denne sag'), true)
eq('kan proeves igen', view.includes('Prøv igen') && view.includes('void loadEmails()'), true)
eq('fejl saetter flag', view.includes('setLoadError(true)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-mail-load-test OK')
process.exitCode = fail ? 1 : 0
