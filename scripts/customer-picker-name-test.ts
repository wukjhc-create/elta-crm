/** Kundevælgeren ombryder det valgte navn og forslag. Fjern og valg bliver. Koer: npx tsx scripts/customer-picker-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/shared/customer-picker.tsx', 'utf8')

eq('valgt navn ombrydes', src.includes('flex-1 text-left break-words min-w-0'), true)
eq('valgt navn klippes ikke', src.includes('text-left truncate'), false)
eq('forslag ombrydes', src.includes('block text-sm font-medium break-words">{label(c)}'), true)
eq('underlinje ombrydes', src.includes('block text-xs text-gray-500 break-words'), true)
eq('fjern har et navn', src.includes('aria-label="Fjern kunde"'), true)
eq('valg bliver', src.includes('onClick={() => pick(c)}'), true)
eq('tom liste bliver', src.includes('Ingen kunder fundet'), true)
eq('testid bliver', src.includes('data-testid="customer-picker-option"'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-picker-name-test OK')
process.exitCode = fail ? 1 : 0
