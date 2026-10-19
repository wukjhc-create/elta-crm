/**
 * Unit-test (ingen I/O) — LG-3/LG-4: fejl i logs uden PostgREST `details` (persondata-rækker).
 *   npx tsx scripts/log-safety-test.ts
 */
import { safeErrorSummary } from '../src/lib/utils/logger'

let bad = 0
const ok = (c: boolean, label: string, got?: unknown) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${!c && got !== undefined ? '  → ' + JSON.stringify(got) : ''}`) }

const pg = { code: '23502', message: 'null value in column "created_by" violates not-null constraint', details: 'Failing row contains (Hans Hansen, hans@example.dk, 12345678, Solvej 12)', hint: null }
const s = safeErrorSummary(pg)
ok(s.includes('23502') && s.includes('not-null') && !s.includes('hans@example.dk') && !s.includes('Solvej'), 'PostgREST-fejl uden details', s)
ok(safeErrorSummary(new Error('boom')) === 'boom', 'Error → message')
ok(safeErrorSummary({ code: '23505', message: 'duplicate key', details: 'Key (email)=(x@y.dk) already exists.' }).includes('x@y.dk') === false, '23505-details med mail udelades')
ok(safeErrorSummary(null) === '' && safeErrorSummary('tekst') === 'tekst', 'null/streng')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ log-sikkerhed ok')
process.exitCode = bad ? 1 : 0
