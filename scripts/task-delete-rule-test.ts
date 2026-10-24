/**
 * MP-00236: sletteregel for opgaver (lib/tasks/task-delete-rule) — ren logik.
 *   npx tsx scripts/task-delete-rule-test.ts
 */
import { taskDeleteAllowed } from '../src/lib/tasks/task-delete-rule'

let bad = 0
const me = 'u-me', other = 'u-other'
const t = (label: string, task: Parameters<typeof taskDeleteAllowed>[0], a: Parameters<typeof taskDeleteAllowed>[1], want: boolean) => {
  const got = taskDeleteAllowed(task, a)
  if (got !== want) bad++
  console.log(`${got === want ? 'PASS' : 'FAIL'}  ${label} → ${got ? 'må slette' : 'må ikke'}`)
}
const office = { canDeleteAll: true, canCreateAny: true, userId: me }
const salg = { canDeleteAll: false, canCreateAny: true, userId: me }
const montor = { canDeleteAll: false, canCreateAny: false, userId: me }
const own = { created_by: me, assigned_to: me, auto_generated: false, service_case_id: 'case-1' }
t('admin/serviceleder: andens opgave', { ...own, created_by: other, assigned_to: other }, office, true)
t('admin/serviceleder: systemopgave', { ...own, created_by: null, auto_generated: true }, office, true)
t('salg/bogholderi: egen oprettet', { ...own, assigned_to: other, service_case_id: null }, salg, true)
t('salg/bogholderi: andens opgave', { ...own, created_by: other }, salg, false)
t('salg/bogholderi: systemopgave (auto)', { ...own, auto_generated: true }, salg, false)
t('salg/bogholderi: uden opretter (system)', { ...own, created_by: null }, salg, false)
t('montør: egen, tildelt sig selv, med sag', own, montor, true)
t('montør: egen, men tildelt en anden', { ...own, assigned_to: other }, montor, false)
t('montør: egen uden sag', { ...own, service_case_id: null }, montor, false)
t('montør: oprettet af en anden', { ...own, created_by: other }, montor, false)
t('montør: systemopgave', { ...own, auto_generated: true }, montor, false)
t('ikke logget ind', own, { ...montor, userId: null }, false)
console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ sletteregel ok')
process.exitCode = bad ? 1 : 0
