/** Mine job ombryder titel og kunde. Status, tom liste og navigering er de samme. Koer: npx tsx scripts/my-jobs-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/tasks/my-jobs-card.tsx', 'utf8')
const start = src.indexOf('data-testid="my-job"')
const row = src.slice(start, src.indexOf('data-testid="my-job-navigate"', start))

eq('overskriften ombrydes', src.includes('flex flex-wrap items-center gap-x-2 gap-y-1 mb-3'), true)
eq('titel ombrydes', row.includes('text-sm font-medium break-words">{w.title}'), true)
eq('kunde ombrydes', row.includes('text-xs text-gray-500 break-words'), true)
eq('raekken klipper ikke', row.includes('truncate'), false)
eq('status bliver', src.includes("planned: 'Planlagt'") && src.includes("in_progress: 'I gang'"), true)
eq('tom uge bliver', src.includes('Ingen planlagte job de næste 7 dage.'), true)
eq('tom uge siger naeste skridt', src.includes('Kontoret planlægger opgaverne.'), true)
eq('tom dag bliver', src.includes('Ingen job i dag.'), true)
eq('navigering bliver', src.includes('data-testid="my-job-navigate"') && src.includes('Navigér til'), true)
eq('link til planlaegning bliver', src.includes('?tab=planlaegning'), true)

console.log(fail ? `\n${fail} fejl` : '\nmy-jobs-mobile-test OK')
process.exitCode = fail ? 1 : 0
