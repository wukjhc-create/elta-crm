/** Afviste tilbuds beloeb ombrydes. formatCurrency og den tomme tekst bliver. Koer: npx tsx scripts/rejection-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8')
const start = src.indexOf('recentRejections.map')
const end = src.indexOf('formatCurrency(r.final_amount)', start)
const item = src.slice(start, end + 'formatCurrency(r.final_amount)'.length)
eq('raekken findes', start > 0 && end > start, true)
eq('beloeb kan krympe', item.includes('text-right min-w-0'), true)
eq('beloeb ombrydes', item.includes('text-xs font-medium text-gray-700 break-words'), true)
eq('beloeb er ikke shrink-0', item.includes('text-right shrink-0'), false)
eq('formatCurrency bliver', item.includes('formatCurrency(r.final_amount)'), true)
eq('titel ombrydes', item.includes('text-sm font-medium text-gray-900 break-words'), true)
eq('klipper ikke', item.includes('truncate'), false)
eq('tom liste bliver', src.includes('Ingen afviste tilbud endnu.'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nrejection-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
