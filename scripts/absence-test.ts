/**
 * Unit-tests for fravær (src/lib/planning/absence.ts, 00228). Ingen DB.
 *   npx tsx scripts/absence-test.ts
 */
import { absenceConflictMessage, absenceLabel, absenceOn, absencePeriodText, isAbsenceConflict, validateAbsenceInput } from '../src/lib/planning/absence'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }
const rows = [{ id: 'a', employee_id: 'e1', kind: 'ferie', start_date: '2026-11-02', end_date: '2026-11-06' }]

ok(absenceOn(rows, 'e1', '2026-11-02')?.id === 'a' && absenceOn(rows, 'e1', '2026-11-06')?.id === 'a', 'inklusiv start og slut')
ok(absenceOn(rows, 'e1', '2026-11-07') === null && absenceOn(rows, 'e2', '2026-11-03') === null, 'udenfor periode / anden medarbejder')
const msg = absenceConflictMessage('Bente', rows[0])
ok(isAbsenceConflict(msg) && /Bente har ferie/.test(msg) && /Planlæg alligevel\?$/.test(msg), 'konfliktbesked genkendes', msg)
ok(!isAbsenceConflict('Medarbejder er inaktiv') && !isAbsenceConflict(null), 'andre fejl er ikke fravær')
ok(absenceLabel('syg') === 'Sygdom' && absenceLabel('ukendt') === 'Fravær', 'labels (ingen detaljer)')
ok(absencePeriodText({ start_date: '2026-11-02', end_date: '2026-11-02' }).length < absencePeriodText(rows[0]).length, 'enkeltdag vs. periode')
ok(validateAbsenceInput({ kind: 'ferie', start_date: '2026-11-02', end_date: '2026-11-06' }).ok, 'gyldig periode')
ok(!validateAbsenceInput({ kind: 'diagnose', start_date: '2026-11-02', end_date: '2026-11-06' }).ok, 'ukendt type afvises')
ok(!validateAbsenceInput({ kind: 'ferie', start_date: '2026-11-06', end_date: '2026-11-02' }).ok, 'til før fra afvises')
ok(!validateAbsenceInput({ kind: 'syg', start_date: '2026-01-01', end_date: '2027-06-01' }).ok, 'over et år afvises')

console.log(bad ? `\n${bad} FEJL` : '\nalle bestået')
process.exitCode = bad ? 1 : 0
