/** Kundekobling ombryder firma, underlinje og fejl. Match og valg bliver. Koer: npx tsx scripts/customer-link-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/mail/customer-link-dialog.tsx', 'utf8')

eq('firma ombrydes', src.includes('break-words min-w-0">{c.company_name}'), true)
eq('underlinje ombrydes', src.includes('text-xs text-gray-500 break-words'), true)
eq('fejl ombrydes', src.includes('break-words min-w-0">{error}'), true)
eq('intet truncate', src.includes('truncate'), false)
eq('match bliver', src.includes('Match på afsender'), true)
eq('valg bliver', src.includes('handleSelect(c)'), true)
eq('tom liste bliver', src.includes('Ingen kunder fundet.'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-link-name-test OK')
process.exitCode = fail ? 1 : 0
