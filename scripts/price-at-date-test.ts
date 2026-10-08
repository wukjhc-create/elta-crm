/**
 * Unit-tests for kostpris på fakturadatoen (src/lib/invoice-control/price-at-date.ts). Ingen DB.
 *   npx tsx scripts/price-at-date-test.ts
 */
import { costPriceAtDate } from '../src/lib/invoice-control/price-at-date'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  fik=${got} forventet=${want}`}`) }
const ch = (old: number | null, at: string) => ({ supplier_product_id: 'p', old_cost_price: old, created_at: at })

eq('ingen ændring efter fakturadatoen → nuværende pris', costPriceAtDate(120, []), 120)
eq('én ændring efter datoen → den gamle pris', costPriceAtDate(120, [ch(100, '2026-10-05T02:00:00Z')]), 100)
eq('flere ændringer → den gamle pris i den FØRSTE (uanset rækkefølge)', costPriceAtDate(140, [ch(120, '2026-10-06T02:00:00Z'), ch(100, '2026-10-05T02:00:00Z')]), 100)
eq('ændring uden kendt gammel pris → kan ikke bestemmes (null, ikke dagens pris)', costPriceAtDate(120, [ch(null, '2026-10-05T02:00:00Z')]), null)
eq('ukendt nuværende pris og ingen ændring → null', costPriceAtDate(null, []), null)
eq('tekstbeløb', costPriceAtDate(120, [{ supplier_product_id: 'p', old_cost_price: '99.5', created_at: '2026-10-05T02:00:00Z' }]), 99.5)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle pris-på-dato-tests bestået')
process.exitCode = bad ? 1 : 0
