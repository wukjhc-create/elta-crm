/** Lead-filen udleveres ikke naar leadet ikke kan laeses. Koer: npx tsx scripts/lead-attachment-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke læse leadet. Det tælles ikke som at filen ikke hører til.'
const src = fs.readFileSync('src/lib/actions/leads.ts', 'utf8')
const start = src.indexOf('export async function getLeadAttachmentUrlAction')
const end = src.indexOf('async function notifyLeadAssigned')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('laesning siger fejl foer filen', fn.indexOf('if (leadErr)') < fn.indexOf('Filen hører ikke til leadet'), true)
eq('tekst', fn.includes(msg), true)
eq('ikke-fundet bliver et svar', fn.includes("error: 'Lead ikke fundet'"), true)
eq('fremmed fil bliver', fn.includes('Filen hører ikke til leadet'), true)
eq('stien bliver', fn.includes("storagePath.includes('..')"), true)
eq('vaek fil bliver', fn.includes('Filen findes ikke længere'), true)
eq('intet link ved fejl', fn.indexOf(msg) < fn.indexOf('getStorageSignedUrlOrNull'), true)

const view = fs.readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')
eq('fejlen vises og linket lukkes', view.includes('win?.close()') && view.includes('alert(r.error'), true)

console.log(fail ? `\n${fail} fejl` : '\nlead-attachment-read-test OK')
process.exitCode = fail ? 1 : 0
