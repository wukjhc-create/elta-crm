/** Tom mailsoegning siger det og kan ryddes. Koer: npx tsx scripts/mail-empty-search-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/mail/components/mail-list.tsx', 'utf8')
const emptyAt = src.indexOf('emails.length === 0')
const empty = src.slice(emptyAt, emptyAt + 900)

eq('soegning har sin egen tekst', empty.includes('Ingen emails matcher søgningen'), true)
eq('tom indbakke er der stadig', empty.includes('Ingen emails fundet'), true)
eq('ryd bruger den samme handler', empty.includes("onSearchChange('')") && empty.includes('onSearchSubmit()'), true)
eq('krydset har et navn', src.includes('aria-label="Ryd søgning"'), true)
eq('laesefilter kan stadig nulstilles', empty.includes('Vis alle emails'), true)

console.log(fail ? `\n${fail} fejl` : '\nmail-empty-search-test OK')
process.exitCode = fail ? 1 : 0
