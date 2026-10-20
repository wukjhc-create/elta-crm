/** Gem-som-skabelon kan rulles paa mobil. Totalpris og gem bliver. Koer: npx tsx scripts/save-template-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/calculator/template-dialog.tsx', 'utf8')
const start = src.indexOf('aria-labelledby="save-template-title"')
const end = src.indexOf('id="load-template-title"', start)
const save = start >= 0 && end > start ? src.slice(start, end) : ''

eq('udsnit findes', save.length > 0, true)
eq('panelet kan rulles', save.includes('max-h-[90vh] overflow-y-auto'), true)
eq('titel ombrydes', save.includes('break-words min-w-0">Gem som skabelon'), true)
eq('konfiguration stables', save.includes('grid grid-cols-1 sm:grid-cols-2 gap-1'), true)
eq('totalpris bliver', save.includes('{formatCurrency(totalPrice)}'), true)
eq('anlaeg bliver', save.includes('{systemSize} kWp'), true)
eq('gem bliver', save.includes("'Gem skabelon'"), true)
eq('gemmer bliver', save.includes("'Gemmer...'"), true)
eq('luk har et navn', save.includes('aria-label="Luk"'), true)
eq('fejl ombrydes', save.includes('rounded-md break-words'), true)

console.log(fail ? `\n${fail} fejl` : '\nsave-template-mobile-test OK')
process.exitCode = fail ? 1 : 0
