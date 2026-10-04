/**
 * Unit-tests for N23 sagsstatus (src/lib/cases/case-progress.ts). Ingen DB.
 *   npx tsx scripts/case-progress-test.ts
 */
import { shouldAutoStartCase, caseCloseReadiness, caseStartHint } from '../src/lib/cases/case-progress'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }
const clean = { count: 0, openTimer: false }

ok(shouldAutoStartCase('new') && !shouldAutoStartCase('pending') && !shouldAutoStartCase('closed') && !shouldAutoStartCase('in_progress'), 'auto-start kun fra new')

const a = caseCloseReadiness({ caseStatus: 'in_progress', workOrderStatuses: ['done', 'cancelled'], unbilled: clean })
ok(a.ready && a.doneJobs === 1, 'alle job udført + intet ufaktureret → klar')

ok(!caseCloseReadiness({ caseStatus: 'in_progress', workOrderStatuses: ['done', 'planned'], unbilled: clean }).ready, 'åbent job → ikke klar')
ok(!caseCloseReadiness({ caseStatus: 'in_progress', workOrderStatuses: [], unbilled: clean }).ready, 'ingen job → ikke klar')
ok(!caseCloseReadiness({ caseStatus: 'in_progress', workOrderStatuses: ['cancelled'], unbilled: clean }).ready, 'kun annullerede job → ikke klar')

const u = caseCloseReadiness({ caseStatus: 'in_progress', workOrderStatuses: ['done'], unbilled: { count: 3, openTimer: false } })
ok(!u.ready && u.reason.includes('3 post'), 'ufaktureret → ikke klar', u.reason)

ok(!caseCloseReadiness({ caseStatus: 'in_progress', workOrderStatuses: ['done'], unbilled: { count: 0, openTimer: true } }).ready, 'kørende timer → ikke klar')
ok(!caseCloseReadiness({ caseStatus: 'closed', workOrderStatuses: ['done'], unbilled: clean }).ready, 'lukket sag → ikke klar')
ok(caseCloseReadiness({ caseStatus: 'pending', workOrderStatuses: ['done'], unbilled: clean }).ready, 'afventer-sag med alt udført → klar')

// N58: start-hint for sager der står som Ny trods arbejde
const h1 = caseStartHint({ caseStatus: 'new', workOrderStatuses: ['done', 'planned'], timeLogCount: 2, issuedInvoiceCount: 1 })
ok(h1.suggest && h1.reason === '1 job startet/udført, 2 timeregistreringer, 1 faktura udstedt', 'N58: ny sag med arbejde → forslag', h1.reason)
ok(!caseStartHint({ caseStatus: 'new', workOrderStatuses: ['planned'], timeLogCount: 0, issuedInvoiceCount: 0 }).suggest, 'N58: kun planlagt job → intet forslag')
ok(!caseStartHint({ caseStatus: 'in_progress', workOrderStatuses: ['done'], timeLogCount: 3, issuedInvoiceCount: 0 }).suggest, 'N58: allerede i gang → intet forslag')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle sagsstatus-tests bestået')
process.exitCode = bad ? 1 : 0
