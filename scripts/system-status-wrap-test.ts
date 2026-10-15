/** Systemstatus kan krympe. Danske etiketter og taellinger bliver. Koer: npx tsx scripts/system-status-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/dashboard/operational-overview.tsx', 'utf8')
const start = src.indexOf('grid grid-cols-2 md:grid-cols-5 gap-2 min-w-0')
const block = src.slice(start, src.indexOf('function ', start + 10))
eq('gitteret kan krympe', start > 0, true)
eq('kortet kan krympe', block.includes('p-3 rounded ring-1 min-w-0'), true)
eq('tjeneste ombrydes', block.includes('break-words">{SERVICE_LABEL[s.service] || s.service}'), true)
eq('status ombrydes', block.includes('text-sm font-medium break-words'), true)
eq('taelling ombrydes', block.includes('text-[11px] text-gray-500 break-words'), true)
eq('taelling bliver', block.includes('{s.errorsLastHour} fejl · {s.warningsLastHour} advarsler (1 t)'), true)
eq('statuslabel bliver', block.includes('healthStatusLabel(s.status)'), true)
eq('fejltekst bliver', src.includes('text-red-700 break-words" title={s.lastErrorMessage}'), true)
eq('noegletallets tekst bliver', src.includes('break-words">{label}'), true)

console.log(fail ? `\n${fail} fejl` : '\nsystem-status-wrap-test OK')
process.exitCode = fail ? 1 : 0
