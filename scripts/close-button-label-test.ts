/** Luk-ikoner i formularer har et navn. Koer: npx tsx scripts/close-button-label-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const files = [
  'src/components/modules/projects/task-form.tsx',
  'src/components/modules/projects/project-form.tsx',
  'src/app/dashboard/mail/components/quote-form-dialog.tsx',
  'src/app/dashboard/settings/solar/solar-settings-client.tsx',
  'src/components/modules/customers/book-besigtigelse-modal.tsx',
  'src/components/modules/customers/customer-pricing.tsx',
  'src/components/modules/service-cases/create-service-case-modal.tsx',
  'src/components/modules/offers/offer-task-form.tsx',
  'src/components/modules/customers/roof-drawing/roof-drawing-editor.tsx',
  'src/components/modules/customers/customer-tasks.tsx',
]

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  eq(`${file} luk har et navn`, src.includes('aria-label="Luk"'), true)
}

const pricing = fs.readFileSync('src/components/modules/customers/customer-pricing.tsx', 'utf8')
eq('prisaftale lukker stadig med onCancel', pricing.includes('onClick={onCancel}') && pricing.includes('aria-label="Luk"'), true)

console.log(fail ? `\n${fail} fejl` : '\nclose-button-label-test OK')
process.exitCode = fail ? 1 : 0
