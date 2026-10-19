/**
 * Unit-test for TZ-7 (2026-10-19): leverandørsynkens "næste kørsel" i dansk tid.
 *   npx tsx scripts/next-run-test.ts
 */
import { nextDailyRunIso } from '../src/lib/suppliers/next-run'

let bad = 0
const eq = (label: string, got: string, want: string) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} → ${got}${ok ? '' : ` (forventet ${want})`}`) }

// vinter (UTC+1): kl. 03:00 dansk = 02:00Z
eq('vinter, før kl. 3 → samme dag', nextDailyRunIso('0 3 * * *', new Date('2026-01-10T01:00:00Z')), '2026-01-10T02:00:00.000Z')
eq('vinter, efter kl. 3 → næste dag', nextDailyRunIso('0 3 * * *', new Date('2026-01-10T05:00:00Z')), '2026-01-11T02:00:00.000Z')
// sommer (UTC+2): kl. 03:00 dansk = 01:00Z
eq('sommer, 23:30Z (= 01:30 dansk næste dag) → samme danske dag kl. 3', nextDailyRunIso('0 3 * * *', new Date('2026-07-09T23:30:00Z')), '2026-07-10T01:00:00.000Z')
eq('sommer, minut/time', nextDailyRunIso('30 22 * * *', new Date('2026-07-10T10:00:00Z')), '2026-07-10T20:30:00.000Z')
// over sommertidsskift (29/3 2026): planlagt 04:00 dansk → 02:00Z
eq('over DST-skift', nextDailyRunIso('0 4 * * *', new Date('2026-03-28T12:00:00Z')), '2026-03-29T02:00:00.000Z')
eq('ugyldig cron → kl. 3 dansk', nextDailyRunIso('bad', new Date('2026-01-10T05:00:00Z')), '2026-01-11T02:00:00.000Z')
eq('time 25 → kl. 3 dansk', nextDailyRunIso('0 25 * * *', new Date('2026-01-10T05:00:00Z')), '2026-01-11T02:00:00.000Z')

console.log(`\n${bad === 0 ? '✅ ALLE NEXT-RUN-TESTS PASS' : `❌ ${bad} FEJL`}`)
process.exit(bad === 0 ? 0 : 1)
