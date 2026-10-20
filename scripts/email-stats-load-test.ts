/** En fejlet mailstatistik er ikke 0 sendte. Den aegte tomme periode bliver. Koer: npx tsx scripts/email-stats-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/email.ts', 'utf8')
const start = action.indexOf('export async function getEmailStats')
const end = action.indexOf('// EMAIL TESTING ACTIONS')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('traad-fejl kastes', fn.includes("if (threadError) throw new Error('Kunne ikke hente mailstatistik')"), true)
eq('alle mails hentes', fn.includes('fetchAllRows') && fn.includes(".order('id')") && fn.includes('.range(from, to)'), true)
eq('datoen bliver', fn.includes('since.setDate(since.getDate() - options.days)'), true)
eq('tom traad filtrerer ikke', fn.includes('if (threads && threads.length > 0)'), true)
eq('aegte tom periode bliver', fn.includes('if (!messages || messages.length === 0)'), true)
eq('rate bliver', fn.includes('open_rate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0'), true)
const catchBody = fn.slice(fn.indexOf('} catch (error)'))
eq('catch returnerer ikke 0', catchBody.includes('total_sent: 0'), false)
eq('catch kaster', catchBody.includes("throw new Error('Kunne ikke hente mailstatistik')"), true)

const ui = fs.readFileSync('src/app/dashboard/settings/email/email-settings-client.tsx', 'utf8')
eq('banner', ui.includes('data-testid="email-stats-load-error"') && ui.includes('Det tælles ikke som 0 sendte.'), true)
eq('perioden bliver', ui.includes('Vælg en tidsperiode for at se statistik'), true)
eq('forrige tal ryddes', ui.includes('setEmailStats(null)'), true)
eq('succes gemmer tal', ui.includes('setEmailStats(stats)'), true)
eq('toast bliver', ui.includes("toast?.error('Fejl', 'Kunne ikke hente statistik')"), true)
eq('tal vises', ui.includes('{emailStats.total_sent}'), true)

console.log(fail ? `\n${fail} fejl` : '\nemail-stats-load-test OK')
process.exitCode = fail ? 1 : 0
