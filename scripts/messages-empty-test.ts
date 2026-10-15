/** Tom beskedmappe siger hvilken mappe der er tom. Koer: npx tsx scripts/messages-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/messages/messages-list.tsx', 'utf8')
const empty = src.slice(src.indexOf('data-testid="messages-empty"') - 500, src.indexOf('messages.map'))

eq('indbakken siger det', empty.includes('Ingen beskeder i indbakken.') && empty.includes('Nye beskeder vises her.'), true)
eq('sendt siger det', empty.includes('Ingen sendte beskeder.') && empty.includes('Beskeder du sender, vises her.'), true)
eq('arkiv siger det', empty.includes('Ingen arkiverede beskeder.') && empty.includes('Arkiverede beskeder vises her.'), true)

console.log(fail ? `\n${fail} fejl` : '\nmessages-empty-test OK')
process.exitCode = fail ? 1 : 0
