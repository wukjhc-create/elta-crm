/** Tilbuddets linjer kan laeses paa mobil. Belobene bliver. Koer: npx tsx scripts/offer-lines-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const start = src.indexOf('data-testid="offer-lines-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('beskrivelse ombrydes', mobile.includes('break-words">{item.description}'), true)
eq('beloeb bliver', mobile.includes('formatCurrency(item.unit_price, currency, 2)') && mobile.includes('formatCurrency(item.total, currency, 2)'), true)
eq('desktop-tabel bliver', src.includes('hidden md:block overflow-x-auto mb-6'), true)
eq('enhedspris bliver', src.includes('formatCurrency(item.unit_price, currency, 2)'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-lines-mobile-test OK')
process.exitCode = fail ? 1 : 0
