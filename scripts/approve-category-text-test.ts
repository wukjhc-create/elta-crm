/** Kategori uden øvrig omkostning siger at den ikke er relevant. Valg og beløb bliver. Kør: npx tsx scripts/approve-category-text-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/approve-preview-dialog.tsx', 'utf8')
const start = src.indexOf('data-testid="approve-lines-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
const desktop = src.slice(src.indexOf('hidden md:block', start))
eq('kortet siger ikke relevant', mobile.includes('Ikke relevant'), true)
eq('bordet siger ikke relevant', desktop.includes('Ikke relevant'), true)
eq('kategori vises kun for oevrig', src.includes("disposition === 'other_cost' && !alreadyConverted"), true)
eq('spring over bliver', src.includes('value="skip">Spring over'), true)
eq('godkend kalder samme plan', src.includes('onConfirm(plan)'), true)

console.log(fail ? `\n${fail} fejl` : '\napprove-category-text-test OK')
process.exitCode = fail ? 1 : 0
