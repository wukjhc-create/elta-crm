/** Sletning af afleveringsfoto fjerner ikke fluebenet, naar resttaellingen fejler. Koer: npx tsx scripts/handover-count-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/case-handover.ts', 'utf8')
const fn = src.slice(src.indexOf('export async function deleteHandoverPhotoAction'), src.indexOf('export async function signCaseHandoverAction'))
eq('tjekker fejl', fn.includes('if (leftError)'), true)
eq('fejl fjerner ikke flueben', fn.indexOf('if (leftError)') < fn.indexOf('setItem(caseId, att.category, false, null)'), true)
eq('aekte nul fjerner stadig', fn.includes('(count ?? 0) === 0') && fn.includes("endsWith('_photo')"), true)
eq('sletning bliver', fn.includes("error: 'Kunne ikke slette billedet'"), true)
eq('egne billeder bliver', fn.includes('Du kan kun slette dine egne billeder'), true)
eq('tilladelse bliver', fn.includes('Manglende tilladelse til at redigere sagen'), true)
eq('underskrift lukker ikke', src.includes('Underskriften lukker IKKE sagen'), true)

console.log(fail ? `\n${fail} fejl` : '\nhandover-count-load-test OK')
process.exitCode = fail ? 1 : 0
