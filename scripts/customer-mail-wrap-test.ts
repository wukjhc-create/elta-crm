/** Kundens mailtidslinje viser to linjer af emnet. Seneste forhaandsvisning ombrydes. Koer: npx tsx scripts/customer-mail-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-email-timeline.tsx', 'utf8')

eq('emne viser to linjer', src.split('text-sm mt-1 line-clamp-2').length === 3, true)
eq('emne klippes ikke paa en linje', src.includes('text-sm mt-1 truncate'), false)
eq('afsender ombrydes', src.split('text-xs text-gray-500 mt-0.5 break-all').length === 3, true)
eq('seneste forhaandsvisning ombrydes', src.includes('break-words min-w-0" data-testid="customer-mail-latest-preview">{latestMsg.body_preview}'), true)
eq('listeforhaandsvisning bliver paa en linje', src.includes('line-clamp-1">{email.body_preview}') && src.includes('body_preview'), true)
eq('intet emne bliver', src.includes("email.subject || '(Intet emne)'"), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-mail-wrap-test OK')
process.exitCode = fail ? 1 : 0
