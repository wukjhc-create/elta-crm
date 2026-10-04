/**
 * N90: CSV-eksportens datoer/tider er dansk tid uanset serverens tidszone.
 *   npx tsx scripts/csv-export-tz-test.ts
 */
import { csvDate, csvDateTime } from '../src/lib/utils/csv-export'

let failed = 0
const eq = (name: string, got: string, want: RegExp) => { const ok = want.test(got); if (!ok) failed++; console.log(`${ok ? '✓' : '❌'} ${name}${ok ? '' : ` — fik "${got}"`}`) }
eq('22:30 UTC sommertid → 05.10. kl. 00:30', csvDateTime('2026-10-04T22:30:00Z'), /^05\.10\.2026.*00[.:]30$/)
eq('dato af tidsstempel efter dansk midnat', csvDate('2026-10-04T22:30:00Z'), /^05\.10\.2026$/)
eq('ren dato uændret', csvDate('2026-10-04'), /^04\.10\.2026$/)
eq('vintertid: 23:30 UTC → 01.01. kl. 00:30', csvDateTime('2025-12-31T23:30:00Z'), /^01\.01\.2026.*00[.:]30$/)
if (failed) { console.log(`❌ ${failed} fejlede`); process.exit(1) }
console.log('✅ alle CSV-tidszone-tests bestået')
