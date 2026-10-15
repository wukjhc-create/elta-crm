/** Sagens noter siger naar forfatternavnet ikke kan hentes. Noterne bliver. Koer: npx tsx scripts/case-note-authors-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/service-cases.ts', 'utf8')
const start = action.indexOf('export async function getCaseNotes')
const end = action.indexOf('const CASE_NOTE_MAX')
const body = action.slice(start, end)
eq('funktion findes', body.length > 80, true)
eq('notefejl kommer foer navne', body.indexOf("error: 'Kunne ikke hente noter'") < body.indexOf('if (profErr)'), true)
eq('ingen forfatter er ikke en fejl', body.includes('if (authorIds.length)'), true)
eq('fejl beholder noterne', body.includes('namesFailed = true') && body.includes('names_failed: namesFailed'), true)
eq('note uden forfatter bliver', body.includes('author_name: r.created_by ? (nameById.get(r.created_by as string) || null) : null'), true)
eq('tilladelse bliver', body.includes("error: 'Manglende tilladelse: cases.view'"), true)

const view = fs.readFileSync('src/app/dashboard/orders/[id]/order-notes-tab.tsx', 'utf8')
eq('fanen siger det', view.includes('data-testid="case-note-author-names-error"') && view.includes('Det tælles ikke som noter uden forfatter.'), true)
eq('banner kun uden listefejl', view.includes('namesFailed && !error'), true)
eq('noter saettes stadig', view.includes('setNotes(res.data ?? [])'), true)
eq('listen nulstilles ikke', !view.includes('setNotes([])'), true)
eq('tom tekst bliver', view.includes('Ingen noter endnu'), true)
eq('forfatter vises naar navnet findes', view.includes('{n.author_name && <span className="text-xs text-gray-500 break-words">· {n.author_name}</span>}'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-note-authors-test OK')
process.exitCode = fail ? 1 : 0
