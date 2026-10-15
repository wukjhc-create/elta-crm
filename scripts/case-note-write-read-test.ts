/** Note-aendring og sletning siger naar noten ikke kan laeses. Den aendres ikke. Koer: npx tsx scripts/case-note-write-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/service-cases.ts', 'utf8')
const updateStart = action.indexOf('export async function updateCaseNote')
const deleteStart = action.indexOf('export async function deleteCaseNote')
const update = action.slice(updateStart, deleteStart)
const afterDelete = action.indexOf('export async function', deleteStart + 10)
const del = action.slice(deleteStart, afterDelete === -1 ? deleteStart + 2200 : afterDelete)

eq('aendring findes', update.length > 80, true)
eq('aendring siger laesefejl foer ikke-fundet', update.indexOf('if (existingErr)') < update.indexOf("error: 'Noten blev ikke fundet'"), true)
eq('aendring skriver ikke ved laesefejl', update.indexOf('Den er ikke ændret.') < update.indexOf('.update('), true)
eq('ikke-fundet bliver ved aendring', update.includes("error: 'Noten blev ikke fundet'"), true)
eq('tom note bliver', update.includes("error: 'Noten må ikke være tom'"), true)
eq('aendring skriver stadig indhold', update.includes('content: content.slice(0, CASE_NOTE_MAX)'), true)

eq('sletning findes', del.length > 80, true)
eq('sletning siger laesefejl foer ikke-fundet', del.indexOf('if (existingErr)') < del.indexOf("error: 'Noten blev ikke fundet'"), true)
eq('sletning sletter ikke ved laesefejl', del.indexOf('Den er ikke slettet.') < del.indexOf('.delete('), true)
eq('ikke-fundet bliver ved sletning', del.includes("error: 'Noten blev ikke fundet'"), true)

const view = fs.readFileSync('src/app/dashboard/orders/[id]/order-notes-tab.tsx', 'utf8')
eq('fanen viser aendringsfejlen', view.includes("setRowError(res.error || 'Kunne ikke gemme')"), true)
eq('fanen viser slettefejlen', view.includes("setRowError(res.error || 'Kunne ikke slette')"), true)
eq('bekraeftelse bliver', view.includes('Slet denne note? Handlingen kan ikke fortrydes.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-note-write-read-test OK')
process.exitCode = fail ? 1 : 0
