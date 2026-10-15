/** Tom notelog siger at man skriver ovenfor, naar man maa. Koer: npx tsx scripts/customer-notes-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-notes-timeline.tsx', 'utf8')
eq('skrivende bruger faar naeste skridt', src.includes("state.canWrite ? 'Ingen noter endnu. Skriv en note ovenfor.' : 'Ingen noter endnu.'"), true)
eq('noten ombrydes', src.includes('whitespace-pre-wrap break-words min-w-0'), true)
eq('slet har stadig et navn', src.includes('aria-label="Slet note"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-notes-empty-test OK')
process.exitCode = fail ? 1 : 0
