/** Aktivitetsoversigten siger naar et opslag fejler. Tom liste og beloeb bliver. Koer: npx tsx scripts/activity-load-note-test.ts */
import fs from 'fs'
import { activityLoadNote, rowsOrThrow, takenRows } from '../src/lib/data/rows-or-throw'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

eq('raekker bliver', rowsOrThrow(null, [{ id: 'a' }]).map((r) => r.id).join(','), 'a')
eq('null er tom', rowsOrThrow(null, null).length, 0)
let threw = ''
try {
  rowsOrThrow({ message: 'db' }, null)
} catch (err) {
  threw = err instanceof Error ? err.message : 'andet'
}
eq('fejl kastes', threw, 'Kunne ikke hente rækker')

const failed: string[] = []
const kept = takenRows({ status: 'fulfilled', value: [{ id: 'o' }] }, 'Tilbud', failed)
eq('hentet bliver', kept.map((r) => r.id).join(','), 'o')
eq('ingen note endnu', activityLoadNote(failed), null)
const dropped = takenRows({ status: 'rejected', reason: new Error('x') }, 'Sager', failed)
eq('fejl er tom liste', dropped.length, 0)
eq('note siger hvad der manglede', activityLoadNote(failed), 'Kunne ikke hente Sager. Det tælles ikke som en tom kunde.')

const view = fs.readFileSync('src/components/modules/customers/customer-activity-overview.tsx', 'utf8')
eq('bruger allSettled', view.includes('Promise.allSettled(['), true)
eq('tom kun uden fejl', view.includes('totalItems === 0 && !loadNote'), true)
eq('tom tekst bliver', view.includes('Ingen tilbud, sager eller leads på kunden endnu'), true)
eq('beloeb bliver', view.includes('offer.final_amount'), true)
eq('kan proeves igen', view.includes('Prøv igen'), true)

const offers = fs.readFileSync('src/lib/actions/customer-relations.ts', 'utf8')
const offerFn = offers.slice(offers.indexOf('export async function getCustomerOffers'), offers.indexOf('export async function getCustomerProjects'))
eq('tilbud uden rettighed bliver tomt', offerFn.includes('if (!supabase) return []'), true)
eq('tilbudsfejl kastes', offerFn.includes('rowsOrThrow(error, null)'), true)

const cases = fs.readFileSync('src/lib/actions/service-cases.ts', 'utf8')
const caseFn = cases.slice(cases.indexOf('export async function getCustomerServiceCases'), cases.indexOf('export async function getServiceCaseStats'))
eq('sag uden rettighed bliver tom', caseFn.includes("if (!hasPermission('cases.view.all')) return []"), true)
eq('sagsfejl sendes videre', caseFn.includes("err.message === 'Kunne ikke hente rækker') throw err"), true)

console.log(fail ? `\n${fail} fejl` : '\nactivity-load-note-test OK')
process.exitCode = fail ? 1 : 0
