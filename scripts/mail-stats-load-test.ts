/** En fejlet mailtaelling er ikke 0 mails. Indbakken og leverandoererne hentes stadig. Koer: npx tsx scripts/mail-stats-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/incoming-emails.ts', 'utf8')
const start = action.indexOf('export async function getIncomingEmailStats')
const end = action.indexOf('export async function getLeadForEmail')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('fejl kastes', fn.includes("throw new Error('Kunne ikke hente mailtællere')"), true)
eq('aegte nul bliver', fn.includes('total: totalRes.count || 0'), true)
eq('kraever-svar fanges stadig', fn.includes('// Non-critical — counter viser bare 0 ved fejl'), true)

const wrap = "getIncomingEmailStats().then((stats) => ({ stats, failed: false })).catch(() => ({ stats: null, failed: true }))"
const mail = fs.readFileSync('src/app/dashboard/mail/mail-client.tsx', 'utf8')
eq('indbakken overlever fejlen', mail.split(wrap).length - 1, 2)
eq('taellere gemmes kun ved data', mail.split('if (statsResult.stats)').length - 1, 2)
const banner = mail.indexOf('data-testid="mail-stats-load-error"')
const headline = mail.indexOf('Samlet indbakke ({stats.total} emails, {stats.unread} ulæste)')
eq('fejl foer overskrift', banner > 0 && headline > banner, true)
eq('mail siger ikke 0 mails', mail.includes('Det tælles ikke som 0 mails.'), true)
eq('badge skjules ved fejl', mail.includes('!statsFailed && count !== null && count > 0'), true)

const health = fs.readFileSync('src/components/modules/suppliers/supplier-health-overview.tsx', 'utf8')
eq('oversigt overlever fejlen', health.split(wrap).length - 1, 2)
eq('oversigt siger ikke 0', health.includes('data-testid="supplier-mail-stats-load-error"') && health.includes('Det tælles ikke som 0.'), true)
eq('tal skjules', health.includes("{statsFailed ? '—' : emailSync.unidentifiedCount}") && health.includes("{statsFailed ? '—' : emailSync.aoMatchCount}"), true)
eq('leverandoer-fejl bliver', health.includes('Det tælles ikke som 0 leverandører.'), true)
eq('sync-fejl bliver', health.includes('data-testid="supplier-mail-sync-load-error"'), true)
eq('ikke synket bliver', health.includes('Ikke synket'), true)

console.log(fail ? `\n${fail} fejl` : '\nmail-stats-load-test OK')
process.exitCode = fail ? 1 : 0
