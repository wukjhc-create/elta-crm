/**
 * Batch 2: tilbageringning uden Telegram, assistentens bekræftede planer,
 * katalogpris, indkøbsafvigelse og dokumentforslag.
 * Ingen netværk og ingen database.
 * Kør: node node_modules/tsx/dist/cli.mjs scripts/grok-features-2-test.ts
 */
import { callbackQueueWrite, planCallbackInsert } from '../src/lib/integrations/telephony/callback-plan'
import { isDueAssistantReminder } from '../src/lib/assistant/reminder-due'
import { interpretCrmQuestion, planInspectionMove, planMailLink, planTaskAssign, resolveDanishDay } from '../src/lib/assistant/crm-questions'
import { classifyCatalogueQuery, presentPurchasePrice } from '../src/lib/suppliers/product-lookup'
import { invoiceTrafficLight } from '../src/lib/invoice-control/traffic-light'
import type { InvoiceControl } from '../src/lib/invoice-control/engine'
import { suggestDocumentAction } from '../src/lib/documents/document-suggestion'
import { copenhagenWeekBounds } from '../src/lib/operations/planning-window'

let bad = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`)
}

const cases = [
  { id: 's1', customer_id: 'c1', case_number: '2309', title: 'Tavle' },
  { id: 's2', customer_id: 'c1', case_number: '2310', title: 'Tag' },
]
const many = planCallbackInsert({ customerId: 'c1', displayNumber: '71 99 99 99', customerLabel: 'Kjeld', openCases: cases, selectedCaseId: null, dueAtIso: '2026-11-03T10:00:00.000Z' })
eq('flere sager vælges ikke', many.ok, false)
const chosen = planCallbackInsert({ customerId: 'c1', displayNumber: '71 99 99 99', customerLabel: 'Kjeld', openCases: cases, selectedCaseId: 's2', dueAtIso: '2026-11-03T10:00:00.000Z' })
eq('valgt sag og kø uden påmindelse', chosen.ok && chosen.task.service_case_id === 's2' && chosen.task.reminder_at === null && chosen.task.auto_rule === 'assistant_callback', true)
eq('kø ignorerer en påmindelse fra klienten', callbackQueueWrite(true, new Date().toISOString()), { auto_rule: 'assistant_callback', reminder_at: null })
eq('almindelig opgave beholder sin påmindelse', callbackQueueWrite(false, '2026-11-03T10:00:00.000Z').reminder_at, '2026-11-03T10:00:00.000Z')
const now = new Date('2026-11-03T12:00:00.000Z')
eq('tom påmindelse er ikke forfalden', isDueAssistantReminder({ auto_rule: 'assistant_callback', status: 'pending', reminder_at: null }, now), false)
eq('ubesvaret med tid kan stadig minde', isDueAssistantReminder({ auto_rule: 'assistant_missed_call', status: 'pending', reminder_at: '2026-11-03T11:30:00.000Z' }, now), true)

eq('flyt uden sag er stadig afvist', interpretCrmQuestion('Flyt besigtigelse til fredag kl. 10').kind, 'write')
const move = interpretCrmQuestion('Flyt besigtigelse på sag 2309 til fredag kl 10:00')
eq('flyt med sag er et forslag', move.kind, 'propose_move')
eq('fredag efter tirsdag', resolveDanishDay('fredag', '2026-11-03'), '2026-11-06')
eq('ugyldig dato', resolveDanishDay('2026-02-31', '2026-11-03'), null)
eq('ubekræftet flyt udføres ikke', planInspectionMove({ confirmed: false, caseMatches: 1, inspectionMatches: 1, date: '2026-11-06', time: '10:00', today: '2026-11-03' }).execute, false)
eq('flere besigtigelser vælges ikke', planInspectionMove({ confirmed: true, caseMatches: 1, inspectionMatches: 2, date: '2026-11-06', time: '10:00', today: '2026-11-03' }).execute, false)
eq('én besigtigelse kan bekræftes', planInspectionMove({ confirmed: true, caseMatches: 1, inspectionMatches: 1, date: '2026-11-06', time: '10:00', today: '2026-11-03' }).execute, true)
eq('flere opgaver tildeles ikke', planTaskAssign({ confirmed: true, caseMatches: 1, openTaskMatches: 3, assigneeMatches: 1 }).execute, false)
eq('flere mails knyttes ikke', planMailLink({ confirmed: true, caseMatches: 1, mailMatches: 2, sameCustomer: true }).execute, false)

eq('0 er ikke en indkøbspris', presentPurchasePrice(0), null)
eq('tom pris er ukendt', presentPurchasePrice(''), null)
eq('kort ean søger ikke', classifyCatalogueQuery('123', 'ean').ok, false)

const clear: InvoiceControl = { verdict: 'ok', lines: [{ lineNumber: 1, description: 'Kabel', verdict: 'ok', varianceAmount: 0, variancePct: 0, reason: 'inden for tolerance' }], controlledLines: 1, totalLines: 1, coveragePct: 100, overchargeAmount: 0 }
const failed = invoiceTrafficLight({ control: clear, purchasing: { loadFailed: true } })
eq('fejlet indkøbstjek er ukendt', failed.light, 'unknown')
const zeroPrice = invoiceTrafficLight({
  control: clear,
  caseId: 's1',
  purchaseOrderId: 'po',
  purchasing: { lines: [{ invoicedQty: 2, expectedQty: 2, catalogueUnitPrice: 0, previousUnitPrice: null, duplicate: false }] },
})
eq('0-pris bliver ikke grøn', zeroPrice.light === 'green', false)
eq('0-pris har intet beløb', zeroPrice.findings.every((f) => f.code !== 'missing_purchase_price' || f.amount === null), true)
const dup = invoiceTrafficLight({
  control: clear,
  caseId: 's1',
  purchaseOrderId: 'po',
  purchasing: { lines: [{ invoicedQty: 1, expectedQty: 1, catalogueUnitPrice: 10, previousUnitPrice: 10, duplicate: true }] },
})
eq('dubletlinje er rød', dup.light, 'red')

const fileOnly = suggestDocumentAction({ filename: 'fuldmagt.pdf', customers: [{ id: 'c1', label: 'A' }, { id: 'c2', label: 'B' }] })
eq('filnavn er ikke en læst fil', fileOnly.readFile, false)
eq('flere kunder vælges ikke', fileOnly.customerId, null)
eq('tekst må sige at filen er læst', suggestDocumentAction({ filename: 'bilag.pdf', extractedText: 'Dette er en faktura' }).readFile, true)

eq('ugen omkring tirsdag', copenhagenWeekBounds('2026-11-03'), { start: '2026-11-02', end: '2026-11-08' })

if (bad) {
  console.error(`${bad} failed`)
  process.exit(1)
}
console.log('all passed')
