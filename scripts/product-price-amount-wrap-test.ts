/** Produktets listepris og kostpris ombrydes. formatCurrency, kost-visningen og avanceformlen bliver. Koer: npx tsx scripts/product-price-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/products/[id]/product-detail-client.tsx', 'utf8')
const start = src.indexOf('>Priser<')
const end = src.indexOf('Specifikationer', start)
const prices = src.slice(start, end)
const row = (block: string, label: string) => {
  const i = block.indexOf(label)
  const div = block.lastIndexOf('<div', i)
  return block.slice(div, block.indexOf('</div>', i))
}
eq('priskortet findes', start > 0 && end > start, true)
const liste = row(prices, '>Listepris<')
const kost = row(prices, '>Kostpris<')
const avance = row(prices, '>Avance<')
eq('listepris ombrydes', liste.includes('flex-wrap') && liste.includes('min-w-0 break-words') && liste.includes('formatCurrency(product.list_price)'), true)
eq('kostpris ombrydes', kost.includes('flex-wrap') && kost.includes('min-w-0 break-words') && kost.includes('formatCurrency(product.cost_price)'), true)
eq('kost vises kun naar den findes', prices.includes('product.cost_price &&'), true)
eq('avance ombrydes', avance.includes('flex-wrap') && avance.includes('min-w-0 break-words') && avance.includes('margin.toFixed(1)'), true)
eq('avanceformlen bliver', src.includes('((product.list_price - product.cost_price) / product.cost_price) * 100'), true)
eq('listepris er ikke fast', liste.includes('flex justify-between items-center"'), false)

const infoStart = src.indexOf('Produktinformation')
const info = src.slice(infoStart, start)
const kategori = row(info, '>Kategori<')
eq('kategori ombrydes', kategori.includes('flex-wrap') && kategori.includes('break-words') && kategori.includes('product.category.name'), true)
eq('enhed ombrydes', row(info, '>Enhed<').includes('break-words') && row(info, '>Enhed<').includes('product.unit'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nproduct-price-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
