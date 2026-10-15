/** Kundens dokumenttitler og filnavne ombrydes. PDF, deling og underskrift er de samme. Koer: npx tsx scripts/customer-documents-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-documents-tab.tsx', 'utf8')
const fulStart = src.indexOf('{/* Fuldmagter */}')
const ful = src.slice(fulStart, src.indexOf('{/* Besigtigelsesrapporter */}', fulStart))
const repStart = src.indexOf('{/* Besigtigelsesrapporter */}')
const rep = src.slice(repStart, src.indexOf('SendBesigtigelsesreportDialog', repStart))
const mailStart = src.indexOf('Mail-vedhæftninger')
const mail = src.slice(mailStart, src.indexOf('{/* Andre dokumenter */}', mailStart))
const otherStart = src.indexOf('{/* Andre dokumenter */}')
const other = src.slice(otherStart, otherStart + 2500)

eq('fuldmagt-titel ombrydes', ful.includes('text-sm font-medium break-words">{doc.title}'), true)
eq('fuldmagt klippes ikke', ful.includes('truncate'), false)
eq('pdf kun naar underskrevet', ful.includes("doc.fuldmagt_status === 'signed'") && ful.includes('> PDF'), true)
eq('afventer underskrift bliver', ful.includes('Afventer kundens underskrift'), true)
eq('rapport-titel ombrydes', rep.includes('text-sm font-medium break-words">{doc.title}'), true)
eq('rapport klippes ikke', rep.includes('truncate'), false)
eq('rapport kan stadig sendes', rep.includes('setSendDialogDoc(doc)') && rep.includes('> Send'), true)
eq('mailfil ombrydes', mail.includes('text-sm font-medium break-all">{doc.file_name}'), true)
eq('mailfil klippes ikke', mail.includes('truncate'), false)
eq('andet dokument ombrydes', other.includes('text-sm font-medium break-words">{doc.title}'), true)
eq('beskrivelse ombrydes', other.includes('break-words mt-0.5">{displayDesc}'), true)
eq('metadata skjules stadig', other.includes('Dokumentmetadata'), true)
eq('mailarkiv deles ikke', other.includes('!doc.source_email_id && shareButton(doc)'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-documents-wrap-test OK')
process.exitCode = fail ? 1 : 0
