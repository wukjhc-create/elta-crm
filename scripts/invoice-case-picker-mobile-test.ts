/** Sagvaelgeren paa leverandoerfakturaen kan rulles. Soegning og loft bliver. Koer: npx tsx scripts/invoice-case-picker-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/incoming-invoices/[id]/incoming-invoice-case-picker.tsx', 'utf8')

eq('panelet kan rulles', src.includes('w-full max-w-lg max-h-[90vh] overflow-y-auto'), true)
eq('titel ombrydes', src.includes('text-base font-semibold text-gray-900 break-words min-w-0'), true)
eq('hjaelp ombrydes', src.includes('text-xs text-gray-600 break-words'), true)
eq('fejl ombrydes', src.includes('min-w-0 break-words">{error}'), true)
eq('hentefejl ombrydes', src.includes('min-w-0 break-words">{loadError}'), true)
eq('luk har et navn', src.includes('aria-label="Luk"'), true)
eq('soegning bliver', src.includes('aria-label="Søg åbne sager"'), true)
eq('loft bliver', src.includes('.slice(0, 30)'), true)
eq('arbejdsordre ryddes stadig', src.includes('matched_work_order_id'), true)
eq('match bliver', src.includes('onPick(c.id)'), true)
eq('annuller bliver', src.includes('Annullér'), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoice-case-picker-mobile-test OK')
process.exitCode = fail ? 1 : 0
