/** Sagsfakturakladdens mobilbeloeb ombrydes. fmtKr bliver. Koer: npx tsx scripts/billing-draft-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')
const slice = (id: string) => {
  const start = src.indexOf('data-testid="' + id + '"')
  const end = src.indexOf('hidden md:block', start)
  return { start, end, mobile: src.slice(start, end) }
}
const time = slice('billing-time-mobile')
const materials = slice('billing-materials-mobile')
const other = slice('billing-other-mobile')
eq('timer findes', time.start > 0 && time.end > time.start, true)
eq('materialer findes', materials.start > 0 && materials.end > materials.start, true)
eq('oevrige findes', other.start > 0 && other.end > other.start, true)
eq('timetotal ombrydes', time.mobile.includes('break-words">{fmtKr(t.total_sales_price)}'), true)
eq('materialetotal ombrydes', materials.mobile.includes('break-words">{fmtKr(m.total_sales_price)}'), true)
eq('oevrig total ombrydes', other.mobile.includes('break-words">{fmtKr(o.total_sales_price)}'), true)
eq('timenavn bliver', time.mobile.includes('break-words">{t.employee_name ??'), true)
eq('materialenavn bliver', materials.mobile.includes('break-words">{m.description}'), true)
eq('oevrig navn bliver', other.mobile.includes('break-words">{o.description}'), true)
eq('timer bliver', time.mobile.includes("t.hours.toLocaleString('da-DK'"), true)
eq('sats bliver', time.mobile.includes('fmtKr(t.hourly_rate)'), true)
eq('materialepris bliver', materials.mobile.includes('fmtKr(m.unit_sales_price)'), true)
eq('ingen shrink-0', time.mobile.includes('shrink-0') === false && materials.mobile.includes('shrink-0') === false && other.mobile.includes('shrink-0') === false, true)

console.log(fail ? '\n' + fail + ' fejl' : '\nbilling-draft-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
