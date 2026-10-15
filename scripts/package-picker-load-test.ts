/** Pakkevaelger: fejlet soegning rydder den forrige liste. Valg og pris bliver. Koer: npx tsx scripts/package-picker-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/packages/package-picker-dialog.tsx', 'utf8')
const start = src.indexOf('const loadPackages')
const end = src.indexOf('const handleSearch')
const load = src.slice(start, end)

eq('gammelt svar ignoreres', load.includes('if (seq !== loadSeq.current) return'), true)
eq('fejl rydder pakker', load.includes('setPackages([])') && load.includes("setLoadError(result.success ? 'Kunne ikke hente pakker' : (result.error || 'Kunne ikke hente pakker'))"), true)
eq('kast rydder pakker', load.includes("setLoadError('Kunne ikke hente pakker')") && load.includes("toast.error('Kunne ikke hente pakker')"), true)
eq('kun aktive bliver', load.includes('is_active: true'), true)
eq('fejlen siges', src.includes('data-testid="package-picker-load-error"') && src.includes('Det tælles ikke som ingen pakker.'), true)
eq('aegte tom liste bliver', src.includes('Ingen pakker fundet'), true)
eq('valg bliver', src.includes('onSelect(pkg.id, pkg.name)'), true)
eq('pris bliver', src.includes('formatCurrency(pkg.total_sale_price)'), true)

console.log(fail ? `\n${fail} fejl` : '\npackage-picker-load-test OK')
process.exitCode = fail ? 1 : 0
