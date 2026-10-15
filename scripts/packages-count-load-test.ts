/** Pakker siger naar taellingen fejler. Tom liste, kost og soegning bliver. Koer: npx tsx scripts/packages-count-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/packages.ts', 'utf8')
const fn = src.slice(src.indexOf('export async function getPackages'), src.indexOf('export async function getPackage('))
eq('taelling tjekker fejl', fn.includes('if (countError)'), true)
eq('aekte nul', fn.includes('const total = count ?? 0'), true)
eq('tilladelse bliver', fn.includes('Manglende tilladelse: pakker'), true)
eq('kost skjules stadig', fn.includes('total_cost_price: 0'), true)

const page = fs.readFileSync('src/app/dashboard/packages/packages-client.tsx', 'utf8')
eq('listefejl', page.includes('data-testid="packages-load-error"') && page.includes('Det tælles ikke som ingen pakker.'), true)
eq('overskrift', page.includes('Antallet kunne ikke hentes. Det tælles ikke som 0 pakker.'), true)
eq('tom bliver', page.includes('Ingen pakker endnu') && page.includes('Opret din første pakke for at komme i gang'), true)
eq('soegning bliver', page.includes('Ingen pakker matcher søgningen'), true)

const picker = fs.readFileSync('src/components/modules/packages/package-picker-dialog.tsx', 'utf8')
eq('vaelger', picker.includes('data-testid="package-picker-load-error"') && picker.includes('Ingen pakker fundet'), true)

const browser = fs.readFileSync('src/components/modules/kalkia/PackageBrowser.tsx', 'utf8')
eq('browser', browser.includes('data-testid="package-browser-load-error"') && browser.includes('Ingen pakker fundet'), true)

console.log(fail ? `\n${fail} fejl` : '\npackages-count-load-test OK')
process.exitCode = fail ? 1 : 0
