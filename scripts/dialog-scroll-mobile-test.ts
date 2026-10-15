/** Kontakt- og tidsdialog kan rulles paa mobil. Gem bliver. Koer: npx tsx scripts/dialog-scroll-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const contact = fs.readFileSync('src/components/modules/customers/contact-form.tsx', 'utf8')
const time = fs.readFileSync('src/components/modules/projects/time-entry-form.tsx', 'utf8')
eq('kontakt kan rulles', contact.includes('w-full max-w-md max-h-[90vh] overflow-y-auto'), true)
eq('kontakt-gem bliver', contact.includes("'Gem ændringer'") && contact.includes("'Tilføj kontakt'"), true)
eq('tid kan rulles', time.includes('w-full max-w-md max-h-[90vh] overflow-y-auto'), true)
eq('tid-titel bliver', time.includes('Registrer Tid'), true)
eq('luk har et navn', contact.includes('aria-label="Luk"') && time.includes('aria-label="Luk"'), true)

console.log(fail ? `\n${fail} fejl` : '\ndialog-scroll-mobile-test OK')
process.exitCode = fail ? 1 : 0
