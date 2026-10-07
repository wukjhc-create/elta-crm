/**
 * Unit-tests for forfaldsdato ved udstedelse (src/lib/invoices/due-date.ts). Ingen DB.
 *   npx tsx scripts/due-date-test.ts
 */
import { rebaseDueDateOnSend } from '../src/lib/invoices/due-date'

let bad = 0
const eq = (label: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  fik=${got} forventet=${want}`}`) }

// review-eksemplet: kladde 1/10 (forfald 15/10 = 14 dage), sendt 25/10 → forfald 8/11
eq('14 dages betingelser regnes fra afsendelsen', rebaseDueDateOnSend('2026-10-01T09:00:00Z', '2026-10-15', new Date('2026-10-25T10:00:00Z')), '2026-11-08')
eq('sendt samme dag → uændret', rebaseDueDateOnSend('2026-10-01T09:00:00Z', '2026-10-15', new Date('2026-10-01T15:00:00Z')), '2026-10-15')
eq('30 dages betingelser', rebaseDueDateOnSend('2026-10-01T09:00:00Z', '2026-10-31', new Date('2026-10-10T08:00:00Z')), '2026-11-09')
// dansk kalender: kladde oprettet 31/10 kl. 23:30 dansk (22:30 UTC) = dansk dato 31/10 → 14 dage
eq('oprettelsesdato i dansk tid', rebaseDueDateOnSend('2026-10-31T22:30:00Z', '2026-11-14', new Date('2026-11-01T10:00:00Z')), '2026-11-15')
eq('afsendt kl. 00:30 dansk tid tæller som den danske dag', rebaseDueDateOnSend('2026-10-01T09:00:00Z', '2026-10-15', new Date('2026-10-24T22:30:00Z')), '2026-11-08')
eq('intet forfald → null', rebaseDueDateOnSend('2026-10-01T09:00:00Z', null), null)
eq('forfald før oprettelse → null (rør ikke)', rebaseDueDateOnSend('2026-10-10T09:00:00Z', '2026-10-01'), null)
eq('ugyldig dato → null', rebaseDueDateOnSend('x', '2026-10-01'), null)

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle forfaldsdato-tests bestået')
process.exitCode = bad ? 1 : 0
