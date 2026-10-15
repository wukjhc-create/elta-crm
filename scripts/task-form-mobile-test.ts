/** Opgave-dialoger stabler felter paa smal skaerm. Koer: npx tsx scripts/task-form-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const files = [
  'src/components/modules/projects/task-form.tsx',
  'src/components/modules/offers/offer-task-form.tsx',
  'src/components/modules/customers/customer-tasks.tsx',
]

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  eq(`${file} felter stables`, src.includes('grid-cols-1 sm:grid-cols-2 gap-4'), true)
  eq(`${file} ikke fast to kolonner`, src.includes('grid grid-cols-2 gap-4'), false)
  eq(`${file} knapper ombrydes`, src.includes('flex flex-wrap justify-end gap-'), true)
  eq(`${file} luk har et navn`, src.includes('aria-label="Luk"'), true)
}

const project = fs.readFileSync(files[0], 'utf8')
eq('gem bliver', project.includes('Opret opgave') && project.includes('Gem ændringer'), true)

console.log(fail ? `\n${fail} fejl` : '\ntask-form-mobile-test OK')
process.exitCode = fail ? 1 : 0
