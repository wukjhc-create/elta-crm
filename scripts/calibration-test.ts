/**
 * Unit-test (ingen DB) for kalibrering af basistider — AI-2.
 *   npx tsx scripts/calibration-test.ts
 */
import { calibrationFromSamples } from '../src/lib/ai/learningEngine'

let bad = 0
const ok = (c: boolean, label: string, got?: unknown) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${!c && got !== undefined ? '  → ' + JSON.stringify(got) : ''}`) }

// 10 kalkulationer: STIK antal 5, 50 min (10 min/stk), faktisk 20 % over → 12 min/stk (før: 6)
const over = Array.from({ length: 10 }, () => ({ estimatedMinutes: 50, actualMinutes: 60, quantity: 5 }))
let r = calibrationFromSamples('STIK', over)
ok(r?.suggested_time_minutes === 12 && r?.current_time_minutes === 10 && r?.variance_percentage === 20, '20 % over → 12 min pr. enhed', r)

// 50 % over → loft +25 %
r = calibrationFromSamples('STIK', Array.from({ length: 5 }, () => ({ estimatedMinutes: 100, actualMinutes: 150, quantity: 10 })))
ok(r?.suggested_time_minutes === 13 && r?.current_time_minutes === 10, '50 % over → højst +25 % (12,5 → 13)', r)

// 60 % under → loft −25 %
r = calibrationFromSamples('STIK', Array.from({ length: 5 }, () => ({ estimatedMinutes: 100, actualMinutes: 40, quantity: 10 })))
ok(r?.suggested_time_minutes === 8, '60 % under → højst −25 % (7,5 → 8)', r)

ok(calibrationFromSamples('STIK', over.slice(0, 2)) === null, 'under 3 samples → intet forslag')
ok(calibrationFromSamples('STIK', Array.from({ length: 5 }, () => ({ estimatedMinutes: 50, actualMinutes: 52, quantity: 5 }))) === null, '4 % afvigelse → intet forslag')
r = calibrationFromSamples('STIK', [...over, { estimatedMinutes: 50, actualMinutes: 60, quantity: 0 }])
ok(r?.sample_size === 10 && Number.isFinite(r?.suggested_time_minutes), 'antal 0 ignoreres (før Infinity)', r)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ kalibrering ok')
process.exitCode = bad ? 1 : 0
