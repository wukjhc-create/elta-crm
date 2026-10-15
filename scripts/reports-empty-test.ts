/** Tomme rapportsektioner siger hvad der mangler. Koer: npx tsx scripts/reports-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
eq('topkunder forklarer kladder', src.includes('Ingen tilbud ud over kladder med en kunde endnu.'), true)
eq('sager forklarer det tomme overblik', src.includes('Ingen sager i overblikket endnu.'), true)
eq('team forklarer stadig timer', src.includes('Ingen tidsregistreringer endnu'), true)
eq('team siger naeste skridt', src.includes('Registrér tiden på sagen under Planlægning.'), true)

console.log(fail ? `\n${fail} fejl` : '\nreports-empty-test OK')
process.exitCode = fail ? 1 : 0
