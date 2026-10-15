/** Kalkia-komponentbrowseren ombryder navnet. Tid og tilføj bliver. Koer: npx tsx scripts/kalkia-component-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/kalkia/ComponentBrowser.tsx', 'utf8')

eq('navn ombrydes', src.includes('font-medium break-words min-w-0">{comp.name}'), true)
eq('navn klippes ikke', src.includes('font-medium truncate'), false)
eq('tid bliver', src.includes('formatTimeMinutes(comp.base_time_minutes)'), true)
eq('valg bliver', src.includes('handleSelectComponent(comp)'), true)
eq('hurtig tilfoej bliver', src.includes('handleQuickAdd(comp)'), true)
eq('tilfoej har et navn', src.includes('aria-label="Tilføj til kalkulation"'), true)

console.log(fail ? `\n${fail} fejl` : '\nkalkia-component-name-test OK')
process.exitCode = fail ? 1 : 0
