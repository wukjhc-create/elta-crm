/** Fakturakladdens timer kan laeses paa mobil. Afkrydsning, timer og sats bliver. Koer: npx tsx scripts/billing-time-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-billing-draft-tab.tsx', 'utf8')
const start = src.indexOf('data-testid="billing-time-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('navn ombrydes', mobile.includes('break-words">{t.employee_name ?? \'—\'}'), true)
eq('beskrivelse ombrydes', mobile.includes('break-words">{t.description}'), true)
eq('dato bliver', mobile.includes('fmtDate(t.date)'), true)
eq('timer bliver', mobile.includes("t.hours.toLocaleString('da-DK'"), true)
eq('sats bliver', mobile.includes('fmtKr(t.hourly_rate)'), true)
eq('total bliver', mobile.includes('fmtKr(t.total_sales_price)'), true)
eq('afkrydsning bliver', mobile.includes('toggleSet(selectedTimeLogs, setSelectedTimeLogs, t.id)'), true)
eq('manglende sats bliver', mobile.includes('Mangler timesats'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block'), true)
eq('desktop-beskrivelse bliver', src.includes('text-[11px] text-gray-500 break-words max-w-[16rem]'), true)
eq('tom liste bliver', src.includes('Ingen ufakturerede timer på sagen.'), true)

console.log(fail ? `\n${fail} fejl` : '\nbilling-time-mobile-test OK')
process.exitCode = fail ? 1 : 0
