/** Grossist-sammenligningen kan laeses paa mobil. Besparelsen bliver. Koer: npx tsx scripts/offer-savings-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/offers/offer-supplier-savings-card.tsx', 'utf8')
const start = src.indexOf('data-testid="offer-supplier-savings-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('linje ombrydes', mobile.includes('break-words">{a.description}'), true)
eq('nu bliver', mobile.includes('kr(a.current.unitCost)'), true)
eq('billigst bliver', mobile.includes('kr(a.best.unitCost)'), true)
eq('besparelse bliver', mobile.includes('kr(a.savingTotal)') && mobile.includes('{a.savingPct}'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)
eq('total bliver', src.includes('alts.reduce((s, a) => s + a.savingTotal, 0)'), true)
eq('tom skjules', src.includes('if (!alts || alts.length === 0) return null'), true)
eq('fejltekst bliver', src.includes('Det tælles ikke som ingen besparelse.'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-savings-mobile-test OK')
process.exitCode = fail ? 1 : 0
