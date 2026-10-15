/** Sagsvaelgeren siger naar listen er skaaret ned til 30. Soegning og opret bliver. Koer: npx tsx scripts/case-picker-cap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const files = [
  'src/app/dashboard/calendar/plan-work-order-dialog.tsx',
  'src/app/dashboard/incoming-invoices/[id]/incoming-invoice-case-picker.tsx',
]
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  eq(`${file} loft bliver`, src.includes('.slice(0, 30)'), true)
  eq(`${file} siger resten`, src.includes('Søg for at finde resten.'), true)
  eq(`${file} tom soegning bliver`, src.includes('Ingen åbne sager matcher søgningen.'), true)
  eq(`${file} filter bliver`, src.includes('c.case_number.toLowerCase().includes(q)') && src.includes('c.title.toLowerCase().includes(q)'), true)
}

const plan = fs.readFileSync(files[0], 'utf8')
eq('opret bliver', plan.includes('createWorkOrderForCase({'), true)
const picker = fs.readFileSync(files[1], 'utf8')
eq('match bliver', picker.includes('onPick(c.id)'), true)
eq('arbejdsordre ryddes stadig', picker.includes('matched_work_order_id'), true)

console.log(fail ? `\n${fail} fejl` : '\ncase-picker-cap-test OK')
process.exitCode = fail ? 1 : 0
