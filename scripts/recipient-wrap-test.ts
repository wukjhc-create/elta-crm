/** Modtager og dokumentnavn ombrydes i bekraeftelse og send-dialog. Afsendelsen er den samme. Koer: npx tsx scripts/recipient-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const status = fs.readFileSync('src/components/modules/customers/document-confirmation-status.tsx', 'utf8')
const dialog = fs.readFileSync('src/components/modules/customers/send-besigtigelsesreport-dialog.tsx', 'utf8')

eq('modtager ombrydes', status.includes('text-sm font-medium text-gray-900 break-words') && status.includes('item.recipientName || item.recipientEmail'), true)
eq('modtagermail ombrydes', status.includes('text-xs text-gray-500 break-all">{item.recipientEmail}'), true)
eq('feltvaerdi ombrydes', status.includes('text-[11px] text-gray-700 break-words'), true)
eq('udloeb kan stadig streges over', status.includes("item.isExpired ? 'text-gray-500 line-through'"), true)
eq('send videre bliver', status.includes('sendReadyChainStep(item.id)') && status.includes('Send videre til partner'), true)
eq('status klipper ikke navne', status.includes('truncate'), false)

const infoStart = dialog.indexOf('{documentTitle}')
const info = dialog.slice(infoStart - 120, dialog.indexOf('Ingen kandidat-modtagere fundet', infoStart))
eq('dokumenttitel ombrydes', info.includes('break-words">{documentTitle}'), true)
eq('filnavn ombrydes', info.includes('break-all">{documentFileName}'), true)
eq('kandidatnavn ombrydes', info.includes('break-words">{r.name}'), true)
eq('kandidatmail ombrydes', info.includes('break-all') && info.includes("r.email || 'mangler email'"), true)
eq('tom kandidatliste bliver', dialog.includes('Ingen kandidat-modtagere fundet.'), true)
eq('dialog klipper ikke navne', info.includes('truncate'), false)

console.log(fail ? `\n${fail} fejl` : '\nrecipient-wrap-test OK')
process.exitCode = fail ? 1 : 0
