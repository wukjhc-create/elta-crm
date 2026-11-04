/**
 * Finance batch 1. Pure rules only — no network and no database.
 */
import { readFileSync } from 'node:fs'
import { economicReadPathAllowed, parseAccountBalance, parseBookedRemainder, parseCollection } from '../src/lib/economic/read-model'
import { buildCashPosition, configuredAmount, evaluateFinanceAlerts, financeSections, formatQualifiedKr, projectCash, qualifyBookedBank, type BookedBankInput, type QualifiedAmount } from '../src/lib/finance/cash-position'
import { BOOKKEEPING_WRITES_IN_THIS_BATCH, canTransitionPosting, POSTING_TABLES_LATER } from '../src/lib/finance/bookkeeping-design'
import { PAYROLL_FLOW, PAYROLL_WRITES_IN_THIS_BATCH } from '../src/lib/finance/payroll-design'
import { buildFinancePosition, forecastBucket, type PayableInput, type ReceivableInput } from '../src/lib/finance/position'
import { hasPermission, type Permission } from '../src/lib/auth/permissions'
import type { UserRole } from '../src/types/auth.types'
import { formatCurrency } from '../src/lib/utils/format'
import { computeInvoiceTotals, type InvoiceTotalsRow } from '../src/lib/invoices/invoice-totals'

let failed = 0
function t(name: string, ok: boolean) {
  if (!ok) {
    failed += 1
    console.error('FAIL', name)
  }
}

const today = '2026-11-04'

function invoice(partial: Partial<ReceivableInput> & Pick<ReceivableInput, 'id'>): ReceivableInput {
  return {
    invoiceNumber: partial.id,
    customerId: 'c1',
    customerName: 'Kunde',
    status: 'sent',
    invoiceType: 'standard',
    voidedAt: null,
    currency: 'DKK',
    finalAmount: 1000,
    amountPaid: 0,
    dueDate: '2026-11-20',
    creditOfInvoiceId: null,
    ...partial,
  }
}

function payable(partial: Partial<PayableInput> & Pick<PayableInput, 'id'>): PayableInput {
  return {
    invoiceNumber: partial.id,
    supplierName: 'Leverandør',
    status: 'approved',
    currency: 'DKK',
    amountInclVat: 500,
    dueDate: '2026-11-20',
    duplicateOfId: null,
    supplierId: null,
    ...partial,
  }
}

const open = buildFinancePosition({
  today,
  receivablesLoaded: true,
  payablesLoaded: true,
  invoices: [
    invoice({ id: 'open', finalAmount: 1000, amountPaid: 400, dueDate: '2026-11-20' }),
    invoice({ id: 'paid-zero', status: 'paid', finalAmount: 800, amountPaid: 0, dueDate: '2026-10-01' }),
    invoice({ id: 'draft', status: 'draft', dueDate: '2026-10-01' }),
    invoice({ id: 'void', voidedAt: '2026-11-01', dueDate: '2026-10-01' }),
    invoice({ id: 'credited', finalAmount: 1000, amountPaid: 0, dueDate: '2026-10-01' }),
    invoice({ id: 'credit', invoiceType: 'credit', finalAmount: -1000, creditOfInvoiceId: 'credited', dueDate: '2026-10-01' }),
    invoice({ id: 'dust', finalAmount: 0.4, amountPaid: 0, dueDate: '2026-10-01' }),
    invoice({ id: 'eur', currency: 'EUR', finalAmount: 50, amountPaid: 0, dueDate: '2026-10-01' }),
    invoice({ id: 'nodue', finalAmount: 100, amountPaid: 0, dueDate: null }),
  ],
  payables: [
    payable({ id: 'sup-30', amountInclVat: 200, dueDate: '2026-11-10' }),
    payable({ id: 'wait', status: 'awaiting_approval', amountInclVat: 9999, dueDate: '2026-11-10' }),
    payable({ id: 'dup', duplicateOfId: 'sup-30', amountInclVat: 200, dueDate: '2026-11-10' }),
    payable({ id: 'recv', status: 'received', amountInclVat: 50 }),
  ],
})

t('partial remainder is 600 and a paid status is not open', open.receivables.state === 'known' && open.receivables.amount === 700.4)
t('fully credited original is not open', !open.invoices.some((row) => row.id === 'credited' || row.id === 'credit'))
t('draft and void are out', open.openCount === 3)
t('EUR is not in the DKK sum', open.otherCurrencyCount === 1)
t('0.40 is not an overdue debtor', open.overdueCount === 0 && !open.invoices.some((row) => row.id === 'dust'))
t('0.40 still sits in the overdue inflow', open.forecast.find((row) => row.id === 'overdue')?.inflow.state === 'known'
  && open.forecast.find((row) => row.id === 'overdue')!.inflow.state === 'known'
  && (open.forecast.find((row) => row.id === 'overdue')!.inflow as { amount: number }).amount === 0.4)
t('due inside 30 days is not overdue', forecastBucket('2026-11-20', today) === 'd30')
t('due today is inside 30 days', forecastBucket(today, today) === 'd30')
t('missing due date is its own bucket', open.forecast.find((row) => row.id === 'undated')?.inflow.state === 'known'
  && (open.forecast.find((row) => row.id === 'undated')!.inflow as { amount: number }).amount === 100)
t('awaiting and duplicates are not payable cash', open.payableInvoiceTotal.state === 'known' && open.payableInvoiceTotal.amount === 200 && open.awaitingCount === 2 && open.payableDuplicates === 1)

const unknownAmount = buildFinancePosition({
  today,
  receivablesLoaded: true,
  payablesLoaded: true,
  invoices: [invoice({ id: 'bad', finalAmount: null, dueDate: '2026-12-01' })],
  payables: [payable({ id: 'bad-sup', amountInclVat: null, dueDate: '2026-12-01' })],
})
t('missing invoice amount is unknown, not 0', unknownAmount.receivables.state === 'unknown')
t('missing supplier amount is unknown, not 0', unknownAmount.payableInvoiceTotal.state === 'unknown')

const unread = buildFinancePosition({
  today,
  receivablesLoaded: false,
  payablesLoaded: false,
  invoices: [],
  payables: [],
})
t('a failed read is unknown, not an empty zero', unread.receivables.state === 'unknown' && unread.payableInvoiceTotal.state === 'unknown')
t('failed forecast inflows are unknown', unread.forecast.every((row) => row.inflow.state === 'unknown' && row.supplierInvoiceTotal.state === 'unknown'))

const empty = buildFinancePosition({ today, receivablesLoaded: true, payablesLoaded: true, invoices: [], payables: [] })
t('a successful empty read is 0', empty.receivables.state === 'known' && empty.receivables.amount === 0 && empty.payableInvoiceTotal.state === 'known' && empty.payableInvoiceTotal.amount === 0)

t('day 31 is the 60-day bucket', forecastBucket('2026-12-05', today) === 'd60')
t('day 61 is the 90-day bucket', forecastBucket('2027-01-04', today) === 'd90')
t('day 91 is later', forecastBucket('2027-02-03', today) === 'later')

t('balance 0 is a real balance', parseAccountBalance({ balance: 0 }).state === 'known' && (parseAccountBalance({ balance: 0 }) as { amount: number }).amount === 0)
t('missing balance is unknown', parseAccountBalance({}).state === 'unknown' && parseAccountBalance({ balance: null }).state === 'unknown')
t('error body is unknown', parseAccountBalance({ message: 'no' }).state === 'unknown')
t('a full page is not complete', parseCollection({ collection: [1, 2], pagination: { nextPage: 'next' } }, 2)?.complete === false)
t('an empty collection is complete', parseCollection({ collection: [] }, 100)?.complete === true && parseCollection({ collection: [] }, 100)?.rows.length === 0)
t('a body without collection is not a zero list', parseCollection({ message: 'x' }, 100) === null)
t('remainder is not invented', parseBookedRemainder({ bookedInvoiceNumber: 4, currency: 'DKK' })?.remainder === null)
t('GET paths stay on the read allowlist', economicReadPathAllowed('/accounts/5820') && economicReadPathAllowed('/invoices/booked') && !economicReadPathAllowed('/invoices/drafts') && !economicReadPathAllowed('/customers/1'))

const nowMs = Date.parse('2026-11-04T08:00:00.000Z')
function bankInput(partial: Partial<BookedBankInput>): BookedBankInput {
  return {
    permitted: true,
    credentialsReady: true,
    accountNumber: 1000,
    probe: 'not_needed',
    balance: { outcome: 'known', amount: 1000 },
    readAt: '2026-11-04T08:00:00.000Z',
    nowMs,
    ...partial,
  }
}
function kr(source: QualifiedAmount['source'], amount: number | null): QualifiedAmount {
  return { source, amount, detail: '' }
}

const complete = buildCashPosition({
  today,
  calculatedAt: '2026-11-04T08:00:00.000Z',
  receivablesLoaded: true,
  payablesLoaded: true,
  invoices: [
    invoice({ id: 'over', finalAmount: 200, amountPaid: 0, dueDate: '2026-10-01' }),
    invoice({ id: 'soon', finalAmount: 300, amountPaid: 0, dueDate: '2026-11-20' }),
    invoice({ id: 'today-due', finalAmount: 50, amountPaid: 0, dueDate: today }),
    invoice({ id: 'day31', finalAmount: 40, amountPaid: 0, dueDate: '2026-12-05' }),
    invoice({ id: 'day61', finalAmount: 10, amountPaid: 0, dueDate: '2027-01-04' }),
    invoice({ id: 'day91', finalAmount: 70, amountPaid: 0, dueDate: '2027-02-03' }),
    invoice({ id: 'nodate', finalAmount: 15, amountPaid: 0, dueDate: null }),
  ],
  payables: [payable({ id: 's1', amountInclVat: 999, dueDate: '2026-11-10', supplierId: 'sup-1' })],
  bank: bankInput({}),
})
t('booked balance stays a ledger figure', complete.bookedBankBalance.source === 'economic_ledger' && complete.bookedBankBalance.amount === 1000 && formatQualifiedKr(complete.bookedBankBalance) === formatCurrency(1000, 'DKK', 2))
t('actual bank balance is never invented', complete.actualBankBalance.source === 'unavailable' && complete.actualBankBalance.amount === null && formatQualifiedKr(complete.actualBankBalance) === 'Ukendt')
t('open receivables keep dated and undated amounts', complete.openReceivables.source === 'crm_forecast' && complete.openReceivables.amount === 685)
t('overdue receivables exclude due today', complete.overdueReceivables.amount === 200 && !complete.overdueCustomerInvoices.some((row) => row.id === 'today-due'))
t('30 days include overdue and due today, not day 31 or undated', complete.forecast30.expectedIncoming.amount === 550 && complete.forecast30.unscheduledReceivables.amount === 15)
t('60 days add day 31 and 90 days stop before day 91', complete.forecast60.expectedIncoming.amount === 590 && complete.forecast90.expectedIncoming.amount === 600 && complete.receivablesAfter90.amount === 70)
t('supplier invoice totals are not open payables', complete.openPayables.source === 'unavailable' && complete.openPayables.amount === null && complete.forecast30.expectedOutgoing.amount === null)
t('projected cash is unknown when outgoing is unknown', complete.forecast30.projectedCash.amount === null && formatQualifiedKr(complete.forecast30.projectedCash) === 'Ukendt' && complete.forecast60.projectedCash.amount === null && complete.forecast90.projectedCash.amount === null)
t('a known projection subtracts a real outgoing', projectCash(kr('economic_ledger', 1000), kr('crm_forecast', 400), kr('economic_open_items', 100)).amount === 1300)
t('a missing outgoing is not subtracted as zero', projectCash(kr('economic_ledger', 1000), kr('crm_forecast', 400), kr('unavailable', null)).amount === null)
t('queues link invoice, customer, supplier invoice and supplier', complete.overdueCustomerInvoices[0]?.documentHref === '/dashboard/invoices/over' && complete.overdueCustomerInvoices[0]?.partyHref === '/dashboard/customers/c1' && complete.upcomingSupplierInvoices[0]?.documentHref === '/dashboard/incoming-invoices/s1' && complete.upcomingSupplierInvoices[0]?.partyHref === '/dashboard/settings/suppliers/sup-1' && complete.upcomingSupplierInvoices[0]?.amountLabel === 'Fakturabeløb' && complete.upcomingSupplierInvoices[0]?.amount === 999 && complete.overdueSupplierInvoices.length === 0)
t('upcoming customers are due today through day 30', complete.upcomingCustomerInvoices.some((row) => row.id === 'today-due') && complete.upcomingCustomerInvoices.some((row) => row.id === 'soon') && !complete.upcomingCustomerInvoices.some((row) => row.id === 'day31' || row.id === 'nodate' || row.id === 'over'))

const missingAccount = qualifyBookedBank(bankInput({ accountNumber: null, probe: 'ok', balance: { outcome: 'not_read' }, readAt: null }))
t('missing bank configuration is unknown, not an account number', missingAccount.source === 'configuration_required' && missingAccount.amount === null && formatQualifiedKr(missingAccount) === 'Ukendt' && !/\d/.test(missingAccount.detail))
const probeDown = qualifyBookedBank(bankInput({ accountNumber: null, probe: 'failed', balance: { outcome: 'not_read' }, readAt: null }))
const probeTimeout = qualifyBookedBank(bankInput({ accountNumber: null, probe: 'timeout', balance: { outcome: 'not_read' }, readAt: null }))
t('a failed probe is an error and not 0', probeDown.source === 'error' && probeTimeout.source === 'error' && formatQualifiedKr(probeDown) === 'Ukendt' && formatQualifiedKr(probeTimeout) === 'Ukendt')
t('no credentials is configuration, distinct from a failed read', qualifyBookedBank(bankInput({ credentialsReady: false, balance: { outcome: 'not_read' }, readAt: null })).source === 'configuration_required')
t('no economic permission does not look like missing setup or zero', qualifyBookedBank(bankInput({ permitted: false, credentialsReady: false, accountNumber: null, balance: { outcome: 'not_read' }, readAt: null })).source === 'unavailable')
const zeroBooked = qualifyBookedBank(bankInput({ balance: { outcome: 'known', amount: 0 } }))
t('a real zero balance stays zero', zeroBooked.source === 'economic_ledger' && zeroBooked.amount === 0 && formatQualifiedKr(zeroBooked) === formatCurrency(0, 'DKK', 2) && formatQualifiedKr(zeroBooked) !== 'Ukendt')
const readFailed = qualifyBookedBank(bankInput({ balance: { outcome: 'failed' }, readAt: null }))
const readTimeout = qualifyBookedBank(bankInput({ balance: { outcome: 'timeout' }, readAt: null }))
t('a failed or timed out balance is Ukendt even if a caller left 0', readFailed.source === 'error' && readTimeout.source === 'error' && formatQualifiedKr(readFailed) === 'Ukendt' && formatQualifiedKr(kr('error', 0)) === 'Ukendt' && formatQualifiedKr(kr('timeout' as QualifiedAmount['source'], 0)) === 'Ukendt')
const stale = qualifyBookedBank(bankInput({ balance: { outcome: 'known', amount: 500 }, readAt: '2026-11-02T07:00:00.000Z' }))
t('a stale read keeps the amount and is not fresh', stale.source === 'stale' && stale.amount === 500 && formatQualifiedKr(stale) === formatCurrency(500, 'DKK', 2))
t('a fresh read is the ledger', qualifyBookedBank(bankInput({ balance: { outcome: 'known', amount: 500 } })).source === 'economic_ledger')

const staleAlerts = evaluateFinanceAlerts({ booked: stale, projected30: kr('unavailable', null), overdueReceivables: kr('crm_forecast', 1), minimumCashDkk: null, overdueThresholdDkk: null })
t('stale data alerts without turning the amount into zero', staleAlerts.some((alert) => alert.code === 'finance_data_stale') && !staleAlerts.some((alert) => alert.code === 'projected_cash_below_minimum'))
t('a read failure alerts', evaluateFinanceAlerts({ booked: readFailed, projected30: kr('error', null), overdueReceivables: kr('error', null), minimumCashDkk: 1, overdueThresholdDkk: 1 }).some((alert) => alert.code === 'economic_read_failed'))
t('missing bank setup alerts', evaluateFinanceAlerts({ booked: missingAccount, projected30: kr('unavailable', null), overdueReceivables: kr('unavailable', null), minimumCashDkk: null, overdueThresholdDkk: null }).some((alert) => alert.code === 'bank_configuration_required'))
t('unknown cash does not alert against a minimum', !evaluateFinanceAlerts({ booked: kr('economic_ledger', 1000), projected30: kr('unavailable', null), overdueReceivables: kr('crm_forecast', 10), minimumCashDkk: 0, overdueThresholdDkk: null }).some((alert) => alert.code === 'projected_cash_below_minimum'))
t('cash below a configured minimum alerts', evaluateFinanceAlerts({ booked: kr('economic_ledger', 1000), projected30: kr('crm_forecast', 99), overdueReceivables: kr('crm_forecast', 10), minimumCashDkk: 100, overdueThresholdDkk: null }).some((alert) => alert.code === 'projected_cash_below_minimum'))
t('cash equal to the minimum does not alert', !evaluateFinanceAlerts({ booked: kr('economic_ledger', 1000), projected30: kr('crm_forecast', 100), overdueReceivables: kr('crm_forecast', 100), minimumCashDkk: 100, overdueThresholdDkk: 100 }).some((alert) => alert.code === 'projected_cash_below_minimum' || alert.code === 'overdue_receivables_above_threshold'))
t('overdue above a configured threshold alerts', evaluateFinanceAlerts({ booked: kr('economic_ledger', 1000), projected30: kr('unavailable', null), overdueReceivables: kr('crm_forecast', 101), minimumCashDkk: null, overdueThresholdDkk: 100 }).some((alert) => alert.code === 'overdue_receivables_above_threshold'))
t('unavailable payables alone do not alert', evaluateFinanceAlerts({ booked: kr('economic_ledger', 1000), projected30: kr('unavailable', null), overdueReceivables: kr('crm_forecast', 1), minimumCashDkk: null, overdueThresholdDkk: null }).length === 0)
t('optional thresholds ignore text', configuredAmount('100') === null && configuredAmount(100) === 100 && configuredAmount(Number.NaN) === null)

const unreadCash = buildCashPosition({ today, calculatedAt: '2026-11-04T08:00:00.000Z', receivablesLoaded: false, payablesLoaded: false, invoices: [], payables: [], bank: bankInput({ balance: { outcome: 'failed' }, readAt: '2026-11-04T08:00:00.000Z' }) })
t('a failed receivable read is not a zero currency', unreadCash.openReceivables.source === 'error' && unreadCash.openReceivables.amount === null && formatQualifiedKr(unreadCash.openReceivables) === 'Ukendt' && formatQualifiedKr(unreadCash.openReceivables) !== formatCurrency(0, 'DKK', 2))
t('a failed read does not keep a success timestamp', unreadCash.economicReadAt === null && unreadCash.openPayables.source === 'error')
const emptyCash = buildCashPosition({ today, calculatedAt: '2026-11-04T08:00:00.000Z', receivablesLoaded: true, payablesLoaded: true, invoices: [], payables: [], bank: bankInput({ balance: { outcome: 'known', amount: 0 } }) })
t('an empty successful receivable read is a real zero', emptyCash.openReceivables.source === 'crm_forecast' && emptyCash.openReceivables.amount === 0 && formatQualifiedKr(emptyCash.openReceivables) === formatCurrency(0, 'DKK', 2))
t('empty payables are still not a zero liability', emptyCash.openPayables.amount === null && emptyCash.forecast30.projectedCash.amount === null)
const blankAmount = buildCashPosition({ today, calculatedAt: '2026-11-04T08:00:00.000Z', receivablesLoaded: true, payablesLoaded: true, invoices: [invoice({ id: 'bad', finalAmount: null, dueDate: '2026-12-01' })], payables: [], bank: bankInput({}) })
t('a missing invoice amount stays unavailable', blankAmount.openReceivables.source === 'unavailable' && blankAmount.openReceivables.amount === null && formatQualifiedKr(blankAmount.openReceivables) === 'Ukendt')

function roleGate(role: UserRole) {
  return { has: (key: Permission) => hasPermission(role, key) }
}
const montor = financeSections(roleGate('montør'))
t('montør has no finance section', !montor.desk && !montor.invoices && !montor.payables && !montor.bank && !montor.economic && !hasPermission('montør', 'economy.view') && !hasPermission('montør', 'invoices.view.all') && !hasPermission('montør', 'invoices.view.own_cases') && !hasPermission('montør', 'incoming_invoices.view') && !hasPermission('montør', 'bank.view') && !hasPermission('montør', 'settings.economic'))
const leder = financeSections(roleGate('serviceleder'))
t('serviceleder sees finance without the bank token', leder.desk && leder.invoices && leder.payables && !leder.bank && !leder.economic)
const actionSrc = readFileSync(new URL('../src/lib/actions/finance-position.ts', import.meta.url), 'utf8')
t('economy.view is checked before the invoice query', actionSrc.indexOf("if (!ctx.hasPermission('economy.view'))") >= 0 && actionSrc.indexOf("if (!ctx.hasPermission('economy.view'))") < actionSrc.indexOf(".from('invoices')"))
t('economic settings are not read without permission', actionSrc.includes('if (!permitted) return { bank, minimumCashDkk: null, overdueThresholdDkk: null }'))
const pageSrc = readFileSync(new URL('../src/app/dashboard/finance/page.tsx', import.meta.url), 'utf8')
t('the finance page does not call e-conomic or render a token', !pageSrc.includes('economicGet') && !pageSrc.includes('X-AppSecretToken') && !pageSrc.includes('X-AgreementGrantToken') && pageSrc.includes('formatQualifiedKr'))
const clientSrc = readFileSync(new URL('../src/lib/services/economic-client.ts', import.meta.url), 'utf8')
t('a timeout is its own read result', clientSrc.includes('res.error === ECONOMIC_TIMEOUT_CODE') && clientSrc.includes("reason: 'timeout'"))
t('bookkeeping stays a design', canTransitionPosting('draft', 'pending_approval') && canTransitionPosting('pending_approval', 'approved') && canTransitionPosting('approved', 'booking') && canTransitionPosting('booking', 'booked') && !canTransitionPosting('draft', 'booked') && !canTransitionPosting('failed', 'booking') && !canTransitionPosting('booked', 'draft') && BOOKKEEPING_WRITES_IN_THIS_BATCH === false && POSTING_TABLES_LATER.length === 3)
const payrollSrc = readFileSync(new URL('../src/lib/finance/payroll-design.ts', import.meta.url), 'utf8')
t('payroll is a later flow without a salary amount', PAYROLL_WRITES_IN_THIS_BATCH === false && PAYROLL_FLOW.join(',') === 'import,validation,proposed_journal,manual_approval,economic_posting' && !payrollSrc.includes('function '))

const rows: InvoiceTotalsRow[] = [
  { id: 'a', invoice_type: 'standard', status: 'sent', final_amount: 1000, amount_paid: 0, currency: 'DKK', due_date: '2026-10-01' },
  { id: 'b', invoice_type: 'credit', status: 'sent', final_amount: -400, amount_paid: 0, currency: 'DKK', credit_of_invoice_id: 'a' },
]
const totals = computeInvoiceTotals(rows, Date.parse('2026-11-04T12:00:00Z'))
t('existing invoice totals still net the credit', totals.outstanding === 600 && totals.overdueSum === 600)

if (failed) {
  console.error(failed, 'failed')
  process.exit(1)
}
console.log('grok-finance-1-test ok')
