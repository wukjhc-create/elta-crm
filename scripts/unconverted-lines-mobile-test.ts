/** Ukonverterede leverandoerlinjer ombrydes paa mobil. Kost og konvertering bliver. Koer: npx tsx scripts/unconverted-lines-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/orders/case-unconverted-supplier-lines-card.tsx', 'utf8')

eq('overskrift ombrydes', src.includes('flex flex-wrap items-center gap-2 text-gray-800 min-w-0'), true)
eq('linje ombrydes', src.includes('flex flex-wrap items-start justify-between gap-x-3 gap-y-1'), true)
eq('beloeb kraever adgang', src.includes('data.can_view_amounts && iv.unconverted_amount != null'), true)
eq('tom betyder konverteret', src.includes('Alle leverandørfaktura-linjer på sagen er konverteret.'), true)
eq('ikke kundevendt', src.includes('Intern indkøbsøkonomi — ikke kundevendt.'), true)
eq('handling bliver', src.includes('data.has_action_required'), true)

console.log(fail ? `\n${fail} fejl` : '\nunconverted-lines-mobile-test OK')
process.exitCode = fail ? 1 : 0
