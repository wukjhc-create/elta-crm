/** Kalenderen siger naar medarbejder eller sag ikke kan hentes. Jobbene bliver. Koer: npx tsx scripts/calendar-relations-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/work-orders.ts', 'utf8')
const start = action.indexOf('export async function listWorkOrdersByDateRange')
const end = action.indexOf('function hideLowProfit')
const fn = action.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('medarbejdere siger fejl', fn.includes("logger.error('listWorkOrdersByDateRange employees failed'"), true)
eq('sager siger fejl', fn.includes("logger.error('listWorkOrdersByDateRange cases failed'"), true)
eq('jobbene bliver', fn.includes('return { success: true, data: enriched, employees_failed: !!empRes.error, cases_failed: !!caseRes.error }'), true)
eq('aegte tom uge bliver', fn.includes('if (wos.length === 0) return { success: true, data: [] }'), true)
eq('ordrefejl bliver', fn.includes("return { success: false, error: 'Kunne ikke hente arbejdsordrer' }"), true)
eq('ikke tildelt paa sagen bliver', action.includes("return { success: false, error: 'Kunne ikke hente medarbejdere. Det tælles ikke som ingen tildelt.' }"), true)

const page = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
eq('kalender siger medarbejdere', page.includes('Medarbejdere kunne ikke hentes. Det tælles ikke som ikke tildelt.'), true)
eq('kalender siger sager', page.includes('Sager kunne ikke hentes. Det tælles ikke som uden sag.'), true)
eq('kalender beholder job', page.includes('workOrders={workOrders}'), true)

const view = fs.readFileSync('src/app/dashboard/calendar/calendar-workforce-client.tsx', 'utf8')
eq('banner', view.includes('data-testid="calendar-relations-error"') && view.includes('!loadError && relationsError'), true)
eq('ikke tildelt paa kortet bliver', view.includes("wo.employee?.name || 'Ikke tildelt'"), true)

const jobs = fs.readFileSync('src/app/dashboard/tasks/my-jobs-card.tsx', 'utf8')
eq('mine job siger sag', jobs.includes('data-testid="my-jobs-relations-error"') && jobs.includes('Det tælles ikke som uden sag.'), true)
eq('link bruger sagens id', jobs.includes('w.case_id ? `/dashboard/orders/${w.case_id}?tab=planlaegning`'), true)
eq('tom uge bliver', jobs.includes('Ingen planlagte job de næste 7 dage.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalendar-relations-test OK')
process.exitCode = fail ? 1 : 0
