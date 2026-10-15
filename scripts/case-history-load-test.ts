/** Sagens noter og aktivitet siger naar hentningen fejler. Tom liste og tider bliver. Koer: npx tsx scripts/case-history-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/service-cases.ts', 'utf8')
const activityStart = action.indexOf('export async function getServiceCaseActivity')
const notesStart = action.indexOf('export async function getCaseNotes')
const notesEnd = action.indexOf('const CASE_NOTE_MAX')
const activityFn = action.slice(activityStart, notesStart)
const notesFn = action.slice(notesStart, notesEnd)
const activityMark = activityFn.indexOf('Kunne ikke hente aktivitet')
const activityErr = activityFn.slice(activityFn.indexOf('if (error)'), activityMark + 'Kunne ikke hente aktivitet'.length)
const notesErr = notesFn.slice(notesFn.indexOf('if (error)'), notesFn.indexOf('const rows'))

eq('aktivitet findes', activityStart > 0 && notesStart > activityStart, true)
eq('aktivitetsfejl er ikke tom', activityErr.includes("success: false") && activityErr.includes('Kunne ikke hente aktivitet') && !activityErr.includes('data: []'), true)
eq('notefejl er ikke tom', notesErr.includes("success: false") && notesErr.includes('Kunne ikke hente noter') && !notesErr.includes('data: []'), true)
eq('aktivitetstilladelse bliver', activityFn.includes("error: 'Manglende tilladelse: cases.view.all'"), true)
eq('notetilladelse bliver', notesFn.includes("error: 'Manglende tilladelse: cases.view'"), true)
eq('rigtig tom aktivitet bliver', activityFn.includes('data: (data || []) as ServiceCaseActivityEntry[]'), true)
eq('rigtige noter bliver', notesFn.includes('const rows = data || []'), true)

const tab = fs.readFileSync('src/app/dashboard/orders/[id]/order-activity-tab.tsx', 'utf8')
eq('fanen siger fejl', tab.includes('Det tælles ikke som ingen aktivitet.'), true)
eq('aktivitet beholdes ved fejl', !tab.includes('setEntries([])'), true)
eq('fanen kan proeves igen', tab.includes('setReloadKey((key) => key + 1)'), true)
eq('tom aktivitet bliver', tab.includes('Ingen aktivitet endnu'), true)
eq('koebenhavn bliver', tab.includes('return copenhagenDateTimeLabel(s)'), true)

const notes = fs.readFileSync('src/app/dashboard/orders/[id]/order-notes-tab.tsx', 'utf8')
eq('noter siger stadig fejl', notes.includes('Det tælles ikke som en tom note-liste.'), true)
eq('tom note bliver', notes.includes('Ingen noter endnu'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-history-load-test OK')
process.exitCode = fail ? 1 : 0
