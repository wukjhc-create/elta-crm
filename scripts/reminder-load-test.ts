/** Paamindelser siger naar hentningen fejler. Tom liste, tilladelse og udfoer bliver. Koer: npx tsx scripts/reminder-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const tasks = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const remStart = tasks.indexOf('export async function getMyPendingReminders')
const remEnd = tasks.indexOf('export async function getActiveProfiles')
const rem = tasks.slice(remStart, remEnd)
eq('paamindelse kaster', rem.includes("throw new Error('Kunne ikke hente påmindelser')"), true)
eq('uden login bliver tom', rem.includes('if (!user) return []'), true)

const priceStart = tasks.indexOf('export async function getUnreadPriceAlerts')
const priceEnd = tasks.indexOf('export async function dismissPriceAlert')
const price = tasks.slice(priceStart, priceEnd)
eq('prisadvarsel kaster', price.includes("throw new Error('Kunne ikke hente prisadvarsler')"), true)
eq('manglende tabel bliver tom', price.includes("if (error.code === 'PGRST205') return []"), true)
eq('manglende tilladelse bliver tom', price.includes("if (await gateDenied('economy.cost_prices')) return []"), true)

const feed = fs.readFileSync('src/lib/actions/notifications.ts', 'utf8')
eq('fejl bliver null', feed.includes("reminders: remindersRes.status === 'fulfilled' ? remindersRes.value : null"), true)

const provider = fs.readFileSync('src/components/layout/notifications-provider.tsx', 'utf8')
eq('fejl beholdes', provider.includes("if (feed.reminders === null)") && provider.includes("setRemindersError('Kunne ikke hente påmindelser')"), true)
eq('succes ryddes', provider.includes('setRemindersError(null)') && provider.includes('setRemindersState(feed.reminders)'), true)
eq('prisfejl beholdes', provider.includes("setPriceAlertsError('Kunne ikke hente prisadvarsler')"), true)

const view = fs.readFileSync('src/components/layout/task-reminder-overlay.tsx', 'utf8')
eq('overlay siger fejl', view.includes('data-testid="reminder-load-error"') && view.includes('Det tælles ikke som ingen påmindelser.'), true)
eq('fejl kun naar listen er tom', view.includes('totalVisible === 0 ? remindersError || priceAlertsError : null'), true)
eq('udfoer bliver', view.includes('completeCustomerTask(taskId)'), true)
eq('kvarter bliver', view.includes('onSnooze(15)'), true)

console.log(fail ? `\n${fail} fejl` : '\nreminder-load-test OK')
process.exitCode = fail ? 1 : 0
