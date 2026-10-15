/** Timerkortets kost, salg og DB ombrydes. Gates og fmtAmount bliver. Koer: npx tsx scripts/time-log-money-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/work-order-time-logs.tsx', 'utf8')
const mobile = src.slice(src.indexOf('data-testid="time-logs-mobile"'), src.indexOf('hidden md:block overflow-x-auto'))
const grid = mobile.slice(mobile.indexOf('grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0'), mobile.indexOf('</dl>', mobile.indexOf('grid grid-cols-2 gap-x-3')))
eq('gitteret kan krympe', grid.startsWith('grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0'), true)
eq('tre celler kan krympe', grid.split('className="min-w-0"').length - 1, 3)
eq('tre beloeb ombrydes', grid.split('break-words').length - 1, 3)
eq('kost bliver', grid.includes('fmtAmount(l.cost_amount)') && grid.includes('Mangler kostpris'), true)
eq('salg bliver', grid.includes('fmtAmount(sale)') && grid.includes('Mangler salgspris'), true)
eq('db bliver', grid.includes("db == null ? '—' : fmtAmount(db)"), true)
eq('kost kraever canSeeCost', grid.indexOf('Mangler kostpris') > grid.indexOf('{canSeeCost && ('), true)
eq('salg kraever canSeeSale', grid.indexOf('Salgspris') > grid.indexOf('{canSeeSale && ('), true)
eq('beskrivelsen klippes ikke', src.includes('truncate'), false)

console.log(fail ? `\n${fail} fejl` : '\ntime-log-money-wrap-test OK')
process.exitCode = fail ? 1 : 0
