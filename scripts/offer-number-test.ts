/**
 * FIN3-2 (2026-10-20): tilbudsnummerets løbenummer ignorerer revisioner (…-R2) og andre suffikser.
 *   npx tsx scripts/offer-number-test.ts
 */
import { maxOfferSequence } from '../src/lib/services/offer-number'
let bad = 0
const eq = (label: string, got: number, want: number) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} → ${got}${ok ? '' : ` (forventet ${want})`}`) }
eq('revision øverst ignoreres', maxOfferSequence(['TILBUD-2026-0042-R2', 'TILBUD-2026-0042', 'TILBUD-2026-0041'], 2026), 42)
eq('kun revisioner → 0', maxOfferSequence(['TILBUD-2026-0042-R2'], 2026), 0)
eq('andet år ignoreres', maxOfferSequence(['TILBUD-2025-0099', 'TILBUD-2026-0003'], 2026), 3)
eq('numerisk maksimum (5 cifre)', maxOfferSequence(['TILBUD-2026-9999', 'TILBUD-2026-10000'], 2026), 10000)
eq('tom liste', maxOfferSequence([], 2026), 0)
eq('null-værdier', maxOfferSequence([null, undefined, 'x'], 2026), 0)
console.log(`\n${bad === 0 ? '✅ ALLE TILBUDSNUMMER-TESTS PASS' : `❌ ${bad} FEJL`}`)
process.exit(bad === 0 ? 0 : 1)
