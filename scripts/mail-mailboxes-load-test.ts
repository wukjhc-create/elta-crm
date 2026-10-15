/** En fejlet postkasseliste er ikke "ingen postkasser". Indbakken hentes stadig. Koer: npx tsx scripts/mail-mailboxes-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/incoming-emails.ts', 'utf8')
const start = action.indexOf('export async function getAllGraphSyncStates')
const end = action.indexOf('export async function triggerEmailSync')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('fejl kastes', fn.includes("if (error) throw new Error('Kunne ikke hente postkasser')"), true)
eq('aegte tom liste bliver', fn.includes('return (data ?? []) as GraphSyncState[]'), true)
eq('sortering bliver', fn.includes(".order('mailbox')"), true)

const mail = fs.readFileSync('src/app/dashboard/mail/mail-client.tsx', 'utf8')
eq('indbakken overlever fejlen', mail.includes('getAllGraphSyncStates().then((states) => ({ states, failed: false })).catch(() => ({ states: [], failed: true }))'), true)
eq('fejlen gemmes', mail.includes('setAllSyncFailed(allStatesResult.failed)'), true)
const banner = mail.indexOf('data-testid="mail-mailboxes-load-error"')
const chips = mail.indexOf('allSyncStates.length > 0')
eq('fejl foer chips', banner > 0 && chips > banner, true)
eq('mail siger ikke ingen postkasser', mail.includes('Det tælles ikke som ingen postkasser.'), true)
eq('aegte aldrig-chip bliver', mail.includes(": 'aldrig'"), true)
eq('tid bliver', mail.includes('formatDate(ss.last_sync_at)'), true)
eq('enkelt-sync bliver', mail.includes('data-testid="mail-sync-load-error"'), true)

console.log(fail ? `\n${fail} fejl` : '\nmail-mailboxes-load-test OK')
process.exitCode = fail ? 1 : 0
