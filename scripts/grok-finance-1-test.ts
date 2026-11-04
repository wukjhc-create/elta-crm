/**
 * Finance batch 1. Pure rules only — no network and no database.
 */
import { economicReadPathAllowed, parseAccountBalance, parseBookedRemainder, parseCollection } from '../src/lib/economic/read-model'
import { buildFinancePosition, forecastBucket, type PayableInput, type ReceivableInput } from '../src/lib/finance/position'
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
