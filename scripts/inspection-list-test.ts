/** Besigtigelsesrapporter paa sagen ombryder titel og filnavn. Koer: npx tsx scripts/inspection-list-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-inspection-tab.tsx', 'utf8')
const start = src.indexOf('Besigtigelsesrapporter på sagen')
const list = src.slice(start, src.indexOf('showFuldmagt', start))

eq('titel ombrydes', list.includes('break-words">{doc.title || doc.file_name}'), true)
eq('filnavn ombrydes', list.includes('break-all">{doc.file_name}'), true)
eq('raekken ombrydes', list.includes('flex flex-wrap items-center justify-between gap-3'), true)
eq('send bliver', list.includes('Send rapport'), true)

console.log(fail ? `\n${fail} fejl` : '\ninspection-list-test OK')
process.exitCode = fail ? 1 : 0
