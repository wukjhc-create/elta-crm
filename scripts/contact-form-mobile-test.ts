/** Kontaktformularen stabler par paa mobil. Felter og roller bliver. Koer: npx tsx scripts/contact-form-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/contact-form.tsx', 'utf8')

eq('titel og rolle stables', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-3'), true)
eq('telefon og mobil stables', src.includes('grid grid-cols-1 sm:grid-cols-2 gap-4'), true)
eq('ikke fast to kolonner', src.includes('grid grid-cols-2 gap-3') || src.includes('grid grid-cols-2 gap-4'), false)
eq('navn er koblet', src.includes('htmlFor="name"') && src.includes('id="name"'), true)
eq('rolle er koblet', src.includes('htmlFor="role"') && src.includes('id="role"'), true)
eq('primaer er koblet', src.includes('htmlFor="is_primary"') && src.includes('id="is_primary"'), true)
eq('faktura-rollen bliver forklaret', src.includes('Faktura/tilbud sendes automatisk'), true)
eq('gem bliver', src.includes("'Gem ændringer'") && src.includes("'Tilføj kontakt'"), true)

console.log(fail ? `\n${fail} fejl` : '\ncontact-form-mobile-test OK')
process.exitCode = fail ? 1 : 0
