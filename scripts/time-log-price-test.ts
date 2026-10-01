/** Unit: prisregel for timer på fakturaer (snapshot → live sats → fallback). Kør: npx tsx scripts/time-log-price-test.ts */
import { priceTimeLog } from '../src/lib/invoices/time-log-price'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`) }
eq('snapshot vinder over ny live sats', priceTimeLog({ hours: 2, sale_amount: 1100, sale_rate_snapshot: 550, live_hourly_rate: 700 }), { hours: 2, rate: 550, total: 1100, source: 'snapshot' })
eq('overtids-snapshot (højere end live) bevares', priceTimeLog({ hours: '2.00', sale_amount: '1500.00', sale_rate_snapshot: '750.00', live_hourly_rate: 500 }), { hours: 2, rate: 750, total: 1500, source: 'snapshot' })
eq('snapshot uden sats → sats = beløb/timer', priceTimeLog({ hours: 4, sale_amount: 2000, live_hourly_rate: 700 }), { hours: 4, rate: 500, total: 2000, source: 'snapshot' })
eq('snapshot 0 kr er gyldigt (ikke fallback)', priceTimeLog({ hours: 1, sale_amount: 0, sale_rate_snapshot: 0 }), { hours: 1, rate: 0, total: 0, source: 'snapshot' })
eq('ingen snapshot → live sats', priceTimeLog({ hours: 1.5, live_hourly_rate: 500 }), { hours: 1.5, rate: 500, total: 750, source: 'live' })
eq('live sats 0 → fallback', priceTimeLog({ hours: 2, live_hourly_rate: 0 }), { hours: 2, rate: 650, total: 1300, source: 'fallback' })
eq('ingen sats → angivet fallback', priceTimeLog({ hours: 2 }, 600), { hours: 2, rate: 600, total: 1200, source: 'fallback' })
eq('afrunding til øre', priceTimeLog({ hours: 0.33, live_hourly_rate: 525 }), { hours: 0.33, rate: 525, total: 173.25, source: 'live' })
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle timepris-tests PASS')
process.exitCode = fail ? 1 : 0
