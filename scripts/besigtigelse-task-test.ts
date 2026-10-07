/**
 * Unit-tests for kundevendte besigtigelsesopgaver (src/lib/tasks/besigtigelse-task.ts). Ingen DB.
 *   npx tsx scripts/besigtigelse-task-test.ts
 */
import { isBookedCustomerBesigtigelse, isPortalBesigtigelseRequest, shouldRemindBesigtigelse } from '../src/lib/tasks/besigtigelse-task'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
const NOW = new Date('2026-10-07T10:00:00Z')

ok(isBookedCustomerBesigtigelse({ title: 'Besigtigelse hos Hansen ApS', auto_rule: null }), 'booket via bookBesigtigelse')
ok(!isBookedCustomerBesigtigelse({ title: 'Planlæg besigtigelse eller montage', auto_rule: 'offer_conversion_startup' }), 'intern opstartsopgave er IKKE kundevendt')
ok(!isBookedCustomerBesigtigelse({ title: 'PORTAL: Besigtigelse anmodet — Hansen', auto_rule: null }), 'kundens egen anmodning er ikke en booket tid')
ok(!isBookedCustomerBesigtigelse({ title: 'Besigtigelse: Hansen', auto_rule: 'assistant_appointment' }), 'assistent-aftale (ingen kundemail) er ikke kundevendt')
ok(!isBookedCustomerBesigtigelse({ title: 'Besigtigelse hos Hansen', auto_rule: 'x' }), 'auto-opgave med samme titel udelukkes')
ok(isPortalBesigtigelseRequest({ title: 'PORTAL: Besigtigelse anmodet — Hansen' }), 'portal-anmodning genkendes')
ok(shouldRemindBesigtigelse({ title: 'Besigtigelse hos Hansen', auto_rule: null, status: 'pending', due_date: '2026-10-10' }, NOW), 'fremtidig booket, ubekræftet → rykkes')
ok(!shouldRemindBesigtigelse({ title: 'Besigtigelse hos Hansen', auto_rule: null, status: 'pending', due_date: '2026-10-01' }, NOW), 'tid passeret → ingen rykker')
ok(!shouldRemindBesigtigelse({ title: 'Besigtigelse hos Hansen', auto_rule: null, status: 'in_progress', due_date: '2026-10-10' }, NOW), 'allerede bekræftet → ingen rykker')
ok(!shouldRemindBesigtigelse({ title: 'Planlæg besigtigelse eller montage', auto_rule: 'offer_conversion_startup', status: 'pending', due_date: null }, NOW), 'intern opgave → aldrig rykker')
ok(!shouldRemindBesigtigelse({ title: 'Besigtigelse hos Hansen', auto_rule: null, status: 'pending', due_date: null }, NOW), 'uden dato → ingen rykker')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle besigtigelses-opgave-tests bestået')
process.exitCode = bad ? 1 : 0
