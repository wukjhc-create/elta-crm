/** Leverandørsøgning på tilbuddet ombrydes, og forældet måned er dansk. Priserne bliver. Kør: npx tsx scripts/offer-supplier-search-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const month = new Date('2026-01-31T23:30:00.000Z').toLocaleDateString('da-DK', {
  timeZone: 'Europe/Copenhagen',
  month: 'short',
  year: 'numeric',
})
eq('maanedsskifte er februar', month.toLowerCase().includes('feb'), true)
eq('maanedsskifte er ikke januar', month.toLowerCase().includes('jan'), false)

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
eq('raekken ombrydes', src.includes('flex flex-wrap items-start gap-3 px-3 py-2.5'), true)
eq('forældet måned er koebenhavn', src.includes("toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', month: 'short', year: 'numeric' })"), true)
eq('60 dage bliver', src.includes('Date.now() - new Date(p.price_updated_at).getTime() > 60 * 86_400_000'), true)
eq('kost og salg bliver', src.includes('formatCurrency(p.cost_price, currency, 2)') && src.includes('formatCurrency(p.estimated_sale_price, currency, 2)'), true)
eq('tom soegning siger naeste skridt', src.includes('Prøv et andet varenummer eller navn.'), true)
eq('tilfoej kaldes stadig', src.includes('handleAddSupplierProduct(p.id)'), true)

console.log(fail ? `\n${fail} fejl` : '\noffer-supplier-search-test OK')
process.exitCode = fail ? 1 : 0
