/** Sagsvaelgere skelner tom soegning fra ingen aabne sager. Koer: npx tsx scripts/case-picker-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const files = [
  'src/app/dashboard/incoming-invoices/[id]/incoming-invoice-case-picker.tsx',
  'src/app/dashboard/calendar/plan-work-order-dialog.tsx',
]

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  eq(`${file} tom soegning`, src.includes('Ingen åbne sager matcher søgningen.'), true)
  eq(`${file} ingen sager`, src.includes('Der er ingen åbne sager.'), true)
  eq(`${file} kan ryddes`, src.includes('Ryd søgning'), true)
  eq(`${file} titel ombrydes`, src.includes('font-medium break-words min-w-0">{c.title}'), true)
  eq(`${file} loftet bliver`, src.includes('.slice(0, 30)'), true)
  eq(`${file} soegning har et navn`, src.includes('aria-label="Søg åbne sager"'), true)
}

const picker = fs.readFileSync(files[0], 'utf8')
eq('fakturaen rydder stadig arbejdsordren', picker.includes('matched_work_order_id'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-picker-empty-test OK')
process.exitCode = fail ? 1 : 0
