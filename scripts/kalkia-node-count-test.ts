/** Sletning af en kalkia-node kraever et rigtigt 0 undernoder. Koer: npx tsx scripts/kalkia-node-count-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/kalkia-nodes.ts', 'utf8')
const fn = src.slice(src.indexOf('export async function deleteKalkiaNode'), src.indexOf('export async function', src.indexOf('export async function deleteKalkiaNode') + 20))
eq('fejl sletter ikke', fn.includes("if (childError) return { success: false, error: 'Kunne ikke tælle undernoder. Det tælles ikke som 0.' }"), true)
eq('fejl foer slet', fn.indexOf('if (childError)') < fn.indexOf(".delete()"), true)
eq('undernoder bliver', fn.includes('Kan ikke slette en node med underliggende noder'), true)
eq('aekte nul kan slette', fn.includes('if ((count ?? 0) > 0)'), true)

console.log(fail ? `\n${fail} fejl` : '\nkalkia-node-count-test OK')
process.exitCode = fail ? 1 : 0
