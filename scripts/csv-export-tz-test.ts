/**
 * N90: CSV-eksportens datoer/tider er dansk tid uanset serverens tidszone.
 *   npx tsx scripts/csv-export-tz-test.ts
 */
import { csvDate, csvDateTime, escapeCsvField } from '../src/lib/utils/csv-export'

let failed = 0
const eq = (name: string, got: string, want: RegExp) => { const ok = want.test(got); if (!ok) failed++; console.log(`${ok ? '✓' : '❌'} ${name}${ok ? '' : ` — fik "${got}"`}`) }
eq('22:30 UTC sommertid → 05.10. kl. 00:30', csvDateTime('2026-10-04T22:30:00Z'), /^05\.10\.2026.*00[.:]30$/)
eq('dato af tidsstempel efter dansk midnat', csvDate('2026-10-04T22:30:00Z'), /^05\.10\.2026$/)
eq('ren dato uændret', csvDate('2026-10-04'), /^04\.10\.2026$/)
eq('vintertid: 23:30 UTC → 01.01. kl. 00:30', csvDateTime('2025-12-31T23:30:00Z'), /^01\.01\.2026.*00[.:]30$/)
eq('formel neutraliseres (=)', escapeCsvField('=HYPERLINK("x")'), /^"'=HYPERLINK/)
eq('formel neutraliseres (+)', escapeCsvField('+45 cmd'), /^'\+45/)
eq('negativt beløb uændret', escapeCsvField('-1.234,56'), /^-1\.234,56$/)
eq('bindestreg + tekst neutraliseres', escapeCsvField('-cmd|calc'), /^'-cmd/)
eq('almindelig tekst uændret', escapeCsvField('Elta Solar'), /^Elta Solar$/)
if (failed) { console.log(`❌ ${failed} fejlede`); process.exit(1) }
console.log('✅ alle CSV-tidszone-tests bestået')
