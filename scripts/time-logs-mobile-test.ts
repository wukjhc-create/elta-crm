/** Timer på en arbejdsordre, små skærme. Kør: npx tsx scripts/time-logs-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/work-order-time-logs.tsx', 'utf8')
const mobileStart = src.indexOf('data-testid="time-logs-mobile"')
const tableStart = src.indexOf('hidden md:block overflow-x-auto')
const mobile = src.slice(mobileStart, tableStart)
const missingCost = mobile.indexOf('Mangler kostpris')
const saleLabel = mobile.indexOf('Salgspris')

eq('mobil-liste findes', mobileStart > 0, true)
eq('tabellen er skjult under md', tableStart > mobileStart, true)
eq('beskrivelse staar som tekst', mobile.includes('{l.description}'), true)
eq('aaben timer staar som tekst', mobile.includes('Åben'), true)
eq('satstype kan skiftes paa kortet', mobile.includes('onChangeRateType') && mobile.includes('aria-label="Satstype"'), true)
eq('manglende kost staar som tekst bag canSeeCost', missingCost > mobile.lastIndexOf('{canSeeCost && (', missingCost) && mobile.lastIndexOf('{canSeeCost && (', missingCost) > 0, true)
eq('salgspris paa kortet kraever canSeeSale', saleLabel > mobile.lastIndexOf('{canSeeSale && (', saleLabel) && mobile.lastIndexOf('{canSeeSale && (', saleLabel) > 0, true)
eq('overskriftens salg kraever canSeeSale', src.includes('canSeeSale && totalSale > 0'), true)
eq('overskriften viser ikke salg uden gate', src.includes('{totalSale > 0 && ` · salg'), false)
eq('afvist timer kan rettes paa kortet', mobile.includes('isRejected') && mobile.includes('startFix(l)') && mobile.includes('deleteRejected(l)') && mobile.includes('rejection_reason'), true)
eq('U155-testid bliver i tabellen', mobile.includes('time-log-fix') || mobile.includes('time-log-rejected-row'), false)
eq('godkendt sats er laast som i tabellen', mobile.includes("approval === 'approved' && !canApprove"), true)

console.log(fail ? `\n${fail} fejl` : '\ntime-logs-mobile-test OK')
process.exitCode = fail ? 1 : 0
