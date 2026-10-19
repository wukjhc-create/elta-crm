/** Paavirkede tilbud kan laeses paa mobil. Beloeb og tab bliver. Koer: npx tsx scripts/price-offers-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/pricing/pricing-client.tsx', 'utf8')
const start = src.indexOf('data-testid="price-offers-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('titel ombrydes', mobile.includes('break-words min-w-0" data-testid="pricing-offer-title-mobile">{offer.offer_title}'), true)
eq('beloeb bliver', mobile.includes('formatCurrency(offer.total_amount)'), true)
eq('tab bliver', mobile.includes("offer.potential_loss > 0 ? '-' : '+'}") && mobile.includes('formatCurrency(Math.abs(offer.potential_loss))'), true)
eq('linjer bliver', mobile.includes('{offer.affected_items}'), true)
eq('dato bliver', mobile.includes('formatDateUtil(offer.created_at)'), true)
eq('link bliver', mobile.includes('href={`/dashboard/offers/${offer.offer_id}`}'), true)
eq('desktop-titel bliver', src.includes('break-words max-w-[16rem] min-w-0" data-testid="pricing-offer-title">{offer.offer_title}'), true)
eq('tom tekst bliver', src.includes('Ingen tilbud er påvirket af nylige prisændringer'), true)
eq('ingen truncate', src.includes('truncate'), false)

console.log(fail ? `\n${fail} fejl` : '\nprice-offers-mobile-test OK')
process.exitCode = fail ? 1 : 0
