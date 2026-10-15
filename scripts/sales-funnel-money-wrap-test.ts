/** Salgstragtens beloeb ombrydes i kortet. 0-som-manglende og monthLabel bliver. Koer: npx tsx scripts/sales-funnel-money-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')
const mobile = src.slice(src.indexOf('data-testid="sales-funnel-mobile"'), src.indexOf('hidden md:block overflow-x-auto'))
const grid = mobile.slice(mobile.indexOf('<dl'), mobile.indexOf('</dl>'))
eq('gitteret kan krympe', grid.includes('grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0'), true)
eq('seks celler kan krympe', grid.split('className="min-w-0"').length - 1, 6)
eq('seks tal ombrydes', grid.split('tabular-nums break-words').length - 1, 6)
eq('vaerdi bliver', grid.includes('m.accepted_value ? kr(m.accepted_value)'), true)
eq('faktureret bliver', grid.includes('m.invoiced_ex_vat ? kr(m.invoiced_ex_vat)'), true)
eq('i alt ombrydes', mobile.includes('text-xs text-gray-700 break-words">Accepteret værdi {kr(t.accepted_value)}'), true)
eq('monthLabel bliver', src.includes('new Date(`${m}-15T12:00:00Z`)') && src.includes("timeZone: 'UTC'"), true)
eq('U-raekke ligger ikke paa kortet', mobile.includes('funnel-row'), false)

console.log(fail ? `\n${fail} fejl` : '\nsales-funnel-money-wrap-test OK')
process.exitCode = fail ? 1 : 0
