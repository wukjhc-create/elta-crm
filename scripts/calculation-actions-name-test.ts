/** Kalkulationens ikoner siger hvad de rammer. Beløb og antal bliver. Koer: npx tsx scripts/calculation-actions-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const list = fs.readFileSync('src/app/dashboard/calculations/calculations-client.tsx', 'utf8')
const page = fs.readFileSync('src/app/dashboard/calculations/[id]/page.tsx', 'utf8')
const quick = fs.readFileSync('src/app/dashboard/calculations/quick/quick-calculation-client.tsx', 'utf8')

eq('listen siger hvilken kalkulation', list.includes('aria-label={`Flere handlinger for ${calc.name}`}'), true)
eq('beloeb bliver', list.includes('formatCurrency(calc.final_amount)'), true)
eq('slet spoerger stadig', list.includes('Er du sikker på at du vil slette'), true)
eq('tilbage har et navn', page.includes('aria-label="Tilbage til kalkulationer"'), true)
eq('linket bliver', page.includes('href="/dashboard/calculations"'), true)
eq('rum kan fjernes med navn', quick.includes('aria-label={`Fjern rum ${room.name}`}') && quick.includes('removeRoom(room.id)'), true)
eq('faerre siger komponenten', quick.includes('aria-label={`Færre ${comp.componentName}`}') && quick.includes('updateComponentQuantity(room.id, comp.id, -1)'), true)
eq('flere siger komponenten', quick.includes('aria-label={`Flere ${comp.componentName}`}') && quick.includes('updateComponentQuantity(room.id, comp.id, 1)'), true)
eq('rummets navn kan ombrydes', quick.includes('flex flex-wrap items-center justify-between gap-2'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalculation-actions-name-test OK')
process.exitCode = fail ? 1 : 0
