/** Mailraekken ombryder afsender og emne. Forhaandsvisningen bliver paa en linje. Koer: npx tsx scripts/mail-row-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/mail/components/mail-list.tsx', 'utf8')
const start = src.indexOf('data-testid="mail-row-web-contact"')
const row = src.slice(start - 400, src.indexOf('body_preview', start))

eq('afsender ombrydes', row.includes('text-sm break-all min-w-0'), true)
eq('emne viser to linjer', row.includes('text-sm line-clamp-2'), true)
eq('forhaandsvisning bliver paa en linje', src.includes('text-xs text-gray-400 truncate mt-0.5') && src.includes('email.body_preview'), true)
eq('hjemmeside-afsender bliver', row.includes('data-testid="mail-row-web-contact"') && row.includes('hjemmesiden'), true)
eq('datoen bliver', row.includes('formatDate(email.received_at)'), true)

console.log(fail ? `\n${fail} fejl` : '\nmail-row-wrap-test OK')
process.exitCode = fail ? 1 : 0
