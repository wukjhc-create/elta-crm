/** Prisovervågning ombryder navne. Priser og procenter er de samme. Kør: npx tsx scripts/pricing-name-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/pricing/pricing-client.tsx', 'utf8')

eq('produktnavn ombrydes', src.includes('font-medium break-words max-w-[16rem] min-w-0" data-testid="pricing-alert-product-name">{alert.product_name}'), true)
eq('varenummer ombrydes', src.includes('text-xs text-gray-400 break-all break-words min-w-0" data-testid="pricing-alert-sku-mobile">{alert.supplier_sku}'), true)
eq('tilbudstitel ombrydes', src.includes('break-words max-w-[16rem] min-w-0" data-testid="pricing-offer-title">{offer.offer_title}'), true)
eq('trendnavn ombrydes', src.includes('font-medium break-words max-w-[16rem] min-w-0" data-testid="pricing-trend-product-name">{trend.product_name}'), true)
eq('ingen truncate paa navn', src.includes('truncate'), false)
eq('gammel og ny pris bliver', src.includes('formatCurrency(alert.old_price)') && src.includes('formatCurrency(alert.new_price)'), true)
eq('aendring bliver', src.includes('alert.change_percentage.toFixed(1)'), true)
eq('tilbudsbelaab bliver', src.includes('formatCurrency(offer.total_amount)') && src.includes('formatCurrency(Math.abs(offer.potential_loss))'), true)
eq('trendpris bliver', src.includes('formatCurrency(trend.current_price)'), true)
eq('tom tilbudstekst bliver', src.includes('Ingen tilbud er påvirket af nylige prisændringer'), true)

console.log(fail ? `\n${fail} fejl` : '\npricing-name-wrap-test OK')
process.exitCode = fail ? 1 : 0
