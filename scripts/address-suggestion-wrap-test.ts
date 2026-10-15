/** Adresseforslag ombryder vejnavnet. Valg og roller bliver. Koer: npx tsx scripts/address-suggestion-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/forms/address-autocomplete.tsx', 'utf8')

eq('forslag ombrydes', src.includes('break-words min-w-0">{s.label}'), true)
eq('forslag klippes ikke', src.includes('truncate">{s.label}'), false)
eq('valg bliver', src.includes('onClick={() => handleSelect(s)}'), true)
eq('liste har en rolle', src.includes('role="listbox"') && src.includes('role="option"'), true)
eq('feltet er en liste', src.includes('aria-autocomplete="list"'), true)

console.log(fail ? `\n${fail} fejl` : '\naddress-suggestion-wrap-test OK')
process.exitCode = fail ? 1 : 0
