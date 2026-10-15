/** Et faktureringsfilter med nul traef staar som filtertom, ikke som ingen sager endnu. Koer: npx tsx scripts/orders-billing-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/orders-list-client.tsx', 'utf8')
const mobile = src.slice(src.indexOf('md:hidden px-3 py-12'), src.indexOf('orders-mobile-list'))
const deskStart = src.indexOf('cases.length === 0 ?')
const desktop = src.slice(deskStart, src.indexOf('cases.map((c)', deskStart))
eq('mobil taeller fakturering', mobile.includes('filters.search || filters.status || filters.type || filters.billing'), true)
eq('skrivebord taeller fakturering', desktop.includes('filters.search || filters.status || filters.type || filters.billing'), true)
eq('filtertekst bliver', src.includes('Ingen sager matcher filtrene.'), true)
eq('aegte tom liste bliver', src.includes('Ingen sager endnu — opret din første sag fra et tilbud, en email eller manuelt.'), true)
eq('nulstil taeller fakturering', src.includes("router.push('/dashboard/orders')") && src.includes('filters.billing'), true)

console.log(fail ? `\n${fail} fejl` : '\norders-billing-empty-test OK')
process.exitCode = fail ? 1 : 0
