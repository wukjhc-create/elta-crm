/** Planlaeg-dialogen kan rulles og ombrydes paa mobil. Opret og dato bliver. Koer: npx tsx scripts/plan-dialog-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calendar/plan-work-order-dialog.tsx', 'utf8')
eq('dialogen kan rulles', src.includes('w-full max-w-lg max-h-[90vh] overflow-y-auto'), true)
eq('fejl ombrydes', src.includes('min-w-0 break-words">{submitError}'), true)
eq('knapper maa ombrydes', src.includes('flex flex-wrap items-center justify-end gap-2'), true)
eq('opret bliver', src.includes('Opret arbejdsordre'), true)
eq('dato bliver', src.includes('type="date"') && src.includes('value={date}'), true)
eq('luk har et navn', src.includes('aria-label="Luk"'), true)

console.log(fail ? `\n${fail} fejl` : '\nplan-dialog-mobile-test OK')
process.exitCode = fail ? 1 : 0
