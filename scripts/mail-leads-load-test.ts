/** En fejlet lead-laesning er ikke ingen leads. Indbakken bliver. Koer: npx tsx scripts/mail-leads-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/incoming-emails.ts', 'utf8')
const start = action.indexOf('export async function getLeadsForEmails')
const end = action.indexOf('export async function markEmailAsRead')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('fejl kastes', fn.includes("throw new Error('Kunne ikke hente leads for mails')"), true)
eq('tom liste bliver', fn.includes('if (emailIds.length === 0) return {}'), true)
eq('catch returnerer ikke tomt', fn.slice(fn.indexOf('} catch')).includes('return {}'), false)

const mail = fs.readFileSync('src/app/dashboard/mail/mail-client.tsx', 'utf8')
eq('begge hentninger fanger', mail.split('getLeadsForEmails(emailIds)').length - 1, 2)
eq('banner', mail.includes('data-testid="mail-leads-load-error"') && mail.includes('Det tælles ikke som ingen leads.'), true)
eq('succes gemmer', mail.split('setEmailLeadMap(leadMap)').length - 1, 2)
const failedTails = mail.split('setLeadMapFailed(true)').slice(1)
eq('fejl rydder ikke kortet', failedTails.length === 2 && failedTails.every((p) => !p.slice(0, 25).includes('setEmailLeadMap')), true)
eq('aegte tom side ryddes', mail.split('setEmailLeadMap({})').length - 1 >= 2, true)

console.log(fail ? `\n${fail} fejl` : '\nmail-leads-load-test OK')
process.exitCode = fail ? 1 : 0
