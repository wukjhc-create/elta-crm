/**
 * Unit: datoformatering i dansk tid uanset processens tidszone (D35). Testen sætter selv TZ=UTC (som Vercel).
 *   npx tsx scripts/format-dk-test.ts
 */
process.env.TZ = 'UTC' // som Vercel — Node læser TZ ved brug, så dette gælder for alle kald nedenfor
import { formatDateLongDK, formatDateTimeDK, formatSmartDate } from '../src/lib/utils/format'
let fail = 0
const eq = (n: string, got: unknown, want: unknown) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : ` fik=${got} forventet=${want}`}`) }
console.log(`(process-tidszone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`)
eq('tidsstempel 00:30 dansk (22:30Z) = dagen efter', formatDateLongDK('2026-10-14T22:30:00Z'), '15. oktober 2026')
eq('tidsstempel midt på dagen', formatDateLongDK('2026-10-15T10:00:00Z'), '15. oktober 2026')
eq('ren dato uændret', formatDateLongDK('2026-10-15'), '15. oktober 2026')
eq('klokkeslæt i dansk sommertid (+2)', formatDateTimeDK('2026-10-15T12:05:00Z'), '15. okt. 2026 14:05')
eq('klokkeslæt i dansk vintertid (+1)', formatDateTimeDK('2026-11-15T12:05:00Z'), '15. nov. 2026 13:05')
eq('Date-objekt', formatDateLongDK(new Date('2026-12-31T23:30:00Z')), '1. januar 2027')
eq('tom → tom streng', formatDateLongDK(null), '')
eq('smart-dato for ældre tidsstempel 00:30 dansk', formatSmartDate('2025-03-09T23:30:00Z'), '10. mar. 2025')
console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle dansk-datoformat-tests PASS')
process.exitCode = fail ? 1 : 0
