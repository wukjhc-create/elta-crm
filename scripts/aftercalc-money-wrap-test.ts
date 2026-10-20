/** Efterkalkulationens beloeb ombrydes i kortet. Tallene bliver. Koer: npx tsx scripts/aftercalc-money-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/aftercalc/aftercalc-overview-client.tsx', 'utf8')
const mobile = src.slice(src.indexOf('data-testid="aftercalc-overview-mobile"'), src.indexOf('hidden md:block overflow-x-auto'))
eq('gitteret kan krympe', mobile.includes('grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0'), true)
eq('beloeb ombrydes', mobile.split('tabular-nums text-gray-900 break-words').length - 1, 4)
eq('tilbudt mobilbeloeb kan krympe', mobile.includes('<dd className="tabular-nums text-gray-900 break-words min-w-0">{kr(r.quoted_revenue)}</dd>'), true)
eq('faktisk mobilbeloeb bliver', mobile.includes('<dd className="tabular-nums text-gray-900 break-words">{kr(r.actual_revenue)}</dd>'), true)
eq('tilbudt db bliver', mobile.includes('<dd className="tabular-nums text-gray-900 break-words">{pct(r.quoted_db_pct)}</dd>'), true)
eq('faktisk db bliver', mobile.includes('<dd className="tabular-nums text-gray-900 break-words">{pct(r.actual_db_pct)}</dd>'), true)
eq('afvigelse ombrydes', mobile.includes('text-sm tabular-nums break-words'), true)
eq('omsaetning bliver', mobile.includes('kr(r.quoted_revenue)') && mobile.includes('kr(r.actual_revenue)'), true)
eq('db bliver', mobile.includes('pct(r.quoted_db_pct)') && mobile.includes('pct(r.actual_db_pct)'), true)
eq('afvigelsestekst bliver', mobile.includes('varianceText(r.db_variance, r.db_variance_pct_points)'), true)
eq('vinduet er ikke udvidet', src.includes('AFTERCALC_CASE_WINDOW') === false, true)

console.log(fail ? `\n${fail} fejl` : '\naftercalc-money-wrap-test OK')
process.exitCode = fail ? 1 : 0
