/** Afviste tilbud siger naar kundenavnet ikke kan hentes. Belob og tom liste bliver. Koer: npx tsx scripts/rejection-names-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const action = fs.readFileSync('src/lib/actions/reports.ts', 'utf8')
const fn = action.slice(action.indexOf('export async function getRecentRejections'), action.indexOf('export async function', action.indexOf('export async function getRecentRejections') + 20))
eq('kunde-fejl siger det', fn.includes("if (customerError) return { success: false, error: 'Kunne ikke hente kundenavne' }"), true)
eq('tilbudsfejl bliver', fn.includes("return { success: false, error: 'Kunne ikke hente afviste tilbud' }"), true)
eq('tom liste bliver', fn.includes('return { success: true, data: [] }'), true)
eq('beloeb bliver', fn.includes('final_amount: o.final_amount || 0'), true)

const page = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8')
eq('dashboard siger fejl', page.includes('Det tælles ikke som ingen afvisninger.'), true)

console.log(fail ? `\n${fail} fejl` : '\nrejection-names-load-test OK')
process.exitCode = fail ? 1 : 0
