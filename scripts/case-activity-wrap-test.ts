/** Sagens aktivitet ombryder beskrivelse og navn. Koer: npx tsx scripts/case-activity-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-activity-tab.tsx', 'utf8')
const list = src.slice(src.indexOf('entries.map'), src.indexOf('Vis ændringer'))

eq('raekken ombrydes', list.includes('flex flex-wrap items-start gap-x-3 gap-y-1'), true)
eq('beskrivelse ombrydes', list.includes('whitespace-pre-wrap break-words'), true)
eq('handling ombrydes', list.includes('text-sm font-medium text-gray-900 break-words'), true)
eq('tidspunktet bliver', list.includes('fmtDateTime(e.created_at)'), true)
eq('tom liste bliver', src.includes('Ingen aktivitet endnu'), true)
eq('aendringer kan stadig vises', src.includes('Vis ændringer'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-activity-wrap-test OK')
process.exitCode = fail ? 1 : 0
