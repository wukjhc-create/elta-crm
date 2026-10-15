/** Leadets mailfil ombrydes. Linket hentes stadig ved klik. Koer: npx tsx scripts/lead-attachment-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')
const start = src.indexOf('Filer fra email')
const block = src.slice(start, src.indexOf('Kontaktoplysninger', start))

eq('filnavn ombrydes', block.includes('break-all min-w-0 flex-1') && block.includes('{att.filename}'), true)
eq('filnavn klippes ikke', block.includes('truncate'), false)
eq('link hentes ved klik', block.includes('getLeadAttachmentUrlAction(lead.id, path)'), true)
eq('fejl vises stadig', block.includes("alert(r.error ?? 'Kunne ikke hente filen')"), true)
eq('stoerrelse bliver', block.includes('MB') && block.includes('KB'), true)

console.log(fail ? `\n${fail} fejl` : '\nlead-attachment-wrap-test OK')
process.exitCode = fail ? 1 : 0
