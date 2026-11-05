/**
 * Canonical cash position. Amounts come from the existing invoice open-amount
 * rule and one configured e-conomic ledger account. A missing figure has no amount.
 * Supplier invoice totals are not open liabilities: CRM stores no remainder.
 *
 * No "stale" source: nothing stores a read timestamp, so every shown balance was read in this request. A read that
 * did not succeed is error. If a later change caches or stores a balance, it must return its age and add stale here.
 */
import { buildFinancePosition, type FinancePosition, type ForecastId, type Money, type PayableInput, type ReceivableInput } from '@/lib/finance/position'
import type { Permission } from '@/lib/auth/permissions'
import { roundMoney } from '@/lib/utils/money-round'
import { formatCurrency } from '@/lib/utils/format'

export type FinanceSource =
  | 'economic_ledger'
  | 'crm_open_items'
  | 'unavailable'
  | 'error'
  | 'configuration_required'

export interface QualifiedAmount {
  source: FinanceSource
  /** Null unless the figure is a real number, including a real zero. */
  amount: number | null
  detail: string
}

export interface CashHorizon {
  days: 30 | 60 | 90
  openingCash: QualifiedAmount
  expectedIncoming: QualifiedAmount
  expectedOutgoing: QualifiedAmount
  projectedCash: QualifiedAmount
  unscheduledReceivables: QualifiedAmount
  unscheduledPayables: QualifiedAmount
  quality: FinanceSource
}

export interface FinanceQueueItem {
  id: string
  label: string
  party: string
  partyHref: string | null
  documentHref: string
  dueDate: string | null
  amount: number | null
  amountLabel: 'Åbent' | 'Fakturabeløb'
}

export interface FinanceAlert {
  code: 'economic_read_failed' | 'finance_read_failed' | 'bank_configuration_required' | 'projected_cash_below_minimum' | 'overdue_receivables_above_threshold'
  text: string
}

export interface FinanceCashPosition {
  calculatedAt: string
  /** The read in this request. Not stored, and not a sync time. */
  economicReadAt: string | null
  bookedBankBalance: QualifiedAmount
  /** Never a PSD2 or realtime bank figure. */
  actualBankBalance: QualifiedAmount
  openReceivables: QualifiedAmount
  overdueReceivables: QualifiedAmount
  openPayables: QualifiedAmount
  overduePayables: QualifiedAmount
  receivablesAfter90: QualifiedAmount
  forecast30: CashHorizon
  forecast60: CashHorizon
  forecast90: CashHorizon
  overdueCustomerInvoices: FinanceQueueItem[]
  upcomingCustomerInvoices: FinanceQueueItem[]
  overdueSupplierInvoices: FinanceQueueItem[]
  upcomingSupplierInvoices: FinanceQueueItem[]
  alerts: FinanceAlert[]
  ledger: FinancePosition
}

const ACTUAL_BANK: QualifiedAmount = {
  source: 'unavailable',
  amount: null,
  detail: 'Der er ingen bankforbindelse. En bogført kontosaldo er ikke en faktisk banksaldo.',
}

const HIDDEN: QualifiedAmount = { source: 'unavailable', amount: null, detail: 'Skjult for denne adgang.' }

const SOURCE_RANK: FinanceSource[] = ['error', 'configuration_required', 'unavailable', 'crm_open_items', 'economic_ledger']

export function worstSource(sources: FinanceSource[]): FinanceSource {
  return sources.reduce((worst, source) => (SOURCE_RANK.indexOf(source) < SOURCE_RANK.indexOf(worst) ? source : worst))
}

function usable(source: FinanceSource): boolean {
  return source === 'economic_ledger' || source === 'crm_open_items'
}

/** Renders a real zero. Error and missing values stay Ukendt, and missing setup says so, even if a caller left 0 on them. */
export function formatQualifiedKr(value: QualifiedAmount): string {
  if (value.source === 'configuration_required') return 'Ikke konfigureret'
  if (!usable(value.source) || value.amount == null || !Number.isFinite(value.amount)) return 'Ukendt'
  return formatCurrency(value.amount, 'DKK', 2)
}

export function projectCash(opening: QualifiedAmount, incoming: QualifiedAmount, outgoing: QualifiedAmount): QualifiedAmount {
  const source = worstSource([opening.source, incoming.source, outgoing.source])
  if (opening.amount == null || incoming.amount == null || outgoing.amount == null || !usable(opening.source) || !usable(incoming.source) || !usable(outgoing.source)) {
    return {
      // Missing setup on the opening balance does not make a forecast "not configured": the forecast is just unknown
      source: source === 'error' ? 'error' : 'unavailable',
      amount: null,
      detail: 'Forventet likviditet beregnes ikke, fordi saldo, indbetaling eller udbetaling mangler. Et manglende tal er ikke 0.',
    }
  }
  return {
    source,
    amount: roundMoney(opening.amount + incoming.amount - outgoing.amount),
    detail: 'Bogført saldo plus åbne indbetalinger i horisonten minus åbne udbetalinger i horisonten.',
  }
}

export interface BookedBankInput {
  permitted: boolean
  /** The settings row could not be read. Not the same as no settings. */
  settingsFailed?: boolean
  credentialsReady: boolean
  accountNumber: number | null
  accountName?: string | null
  probe: 'not_needed' | 'ok' | 'failed' | 'timeout'
  balance: { outcome: 'not_read' } | { outcome: 'known'; amount: number } | { outcome: 'failed' } | { outcome: 'timeout' } | { outcome: 'missing_balance' } | { outcome: 'not_balance_sheet' }
  readAt: string | null
}

export function qualifyBookedBank(input: BookedBankInput): QualifiedAmount {
  if (!input.permitted) {
    return { source: 'unavailable', amount: null, detail: 'Bogført saldo kræver e-conomic-adgang.' }
  }
  if (input.settingsFailed) {
    return { source: 'error', amount: null, detail: 'e-conomic-opsætningen kunne ikke læses. Saldoen er ukendt, ikke 0.' }
  }
  if (!input.credentialsReady) {
    return { source: 'configuration_required', amount: null, detail: 'e-conomic er ikke opsat. Der hentes ingen saldo.' }
  }
  if (input.accountNumber == null || !Number.isInteger(input.accountNumber) || input.accountNumber <= 0) {
    if (input.probe === 'failed' || input.probe === 'timeout') {
      return { source: 'error', amount: null, detail: 'e-conomic kunne ikke læses. Bankkonto er heller ikke valgt, så saldoen er ukendt.' }
    }
    return { source: 'configuration_required', amount: null, detail: 'Bankkonto er ikke valgt i opsætningen. Der er intet kontonummer i koden.' }
  }
  if (input.balance.outcome === 'not_balance_sheet') {
    return { source: 'configuration_required', amount: null, detail: `Konto ${input.accountNumber} er ikke en statuskonto i e-conomic og kan ikke være bankkontoen. Saldoen vises ikke. Ret kontoen i opsætningen.` }
  }
  if (input.balance.outcome === 'timeout' || input.balance.outcome === 'failed' || input.balance.outcome === 'not_read') {
    return { source: 'error', amount: null, detail: 'Den bogførte saldo kunne ikke læses. Det er ikke 0.' }
  }
  if (input.balance.outcome === 'missing_balance') {
    return { source: 'error', amount: null, detail: 'Kontoen havde ingen læsbar saldo. Det er ikke 0.' }
  }
  const name = input.accountName ? ` (${input.accountName})` : ''
  return {
    source: 'economic_ledger',
    amount: input.balance.amount,
    detail: `Bogført saldo på konto ${input.accountNumber}${name}, valgt som bankkonto i opsætningen. Ikke en faktisk banksaldo. Kontrollér, at det er bankkontoen.`,
  }
}

function fromMoney(money: Money, loaded: boolean, detail: string): QualifiedAmount {
  if (!loaded) return { source: 'error', amount: null, detail: 'Tallet kunne ikke læses. Det er ikke 0.' }
  if (money.state === 'unknown') return { source: 'unavailable', amount: null, detail: 'Et beløb mangler, så summen er ukendt. Den er ikke 0.' }
  return { source: 'crm_open_items', amount: money.amount, detail }
}

function windowMoney(position: FinancePosition, id: ForecastId): Money {
  return position.forecast.find((row) => row.id === id)?.inflow ?? { state: 'unknown' }
}

function sumInflows(position: FinancePosition, ids: ForecastId[], loaded: boolean, detail: string): QualifiedAmount {
  const parts = ids.map((id) => windowMoney(position, id))
  if (!loaded) return { source: 'error', amount: null, detail: 'Indbetalingerne kunne ikke læses. Det er ikke 0.' }
  if (parts.some((part) => part.state === 'unknown')) {
    return { source: 'unavailable', amount: null, detail: 'Et indbetalingsbeløb mangler. Horisonten er ikke 0.' }
  }
  return {
    source: 'crm_open_items',
    amount: roundMoney(parts.reduce((sum, part) => sum + (part.state === 'known' ? part.amount : 0), 0)),
    detail,
  }
}

const PAYABLE_GAP = 'CRM gemmer ikke restbeløb på leverandørfakturaer, og e-conomic-kreditorposter læses ikke. Fakturatotalen bruges ikke som gæld og ikke som 0.'

function payableGap(visible: boolean, loaded: boolean): QualifiedAmount {
  if (!visible) return HIDDEN
  if (!loaded) return { source: 'error', amount: null, detail: 'Leverandørfakturaerne kunne ikke læses. Gælden er ikke 0.' }
  return { source: 'unavailable', amount: null, detail: PAYABLE_GAP }
}

export function evaluateFinanceAlerts(input: {
  booked: QualifiedAmount
  projected30: QualifiedAmount
  overdueReceivables: QualifiedAmount
  minimumCashDkk: number | null
  overdueThresholdDkk: number | null
  /** A CRM read the user may see failed. No alert about it would look like nothing is wrong. */
  crmReadFailed?: boolean
}): FinanceAlert[] {
  const alerts: FinanceAlert[] = []
  if (input.crmReadFailed) {
    alerts.push({ code: 'finance_read_failed', text: 'Fakturaerne kunne ikke læses. Tallene vises ikke som 0.' })
  }
  if (input.booked.source === 'error') {
    alerts.push({ code: 'economic_read_failed', text: 'e-conomic-saldoen kunne ikke læses. Den vises ikke som 0.' })
  }
  if (input.booked.source === 'configuration_required') {
    alerts.push({ code: 'bank_configuration_required', text: input.booked.detail })
  }
  if (input.minimumCashDkk != null && Number.isFinite(input.minimumCashDkk) && input.projected30.amount != null && usable(input.projected30.source) && input.projected30.amount < input.minimumCashDkk) {
    alerts.push({ code: 'projected_cash_below_minimum', text: 'Forventet likviditet om 30 dage er under det konfigurerede minimum.' })
  }
  if (input.overdueThresholdDkk != null && Number.isFinite(input.overdueThresholdDkk) && input.overdueReceivables.amount != null && usable(input.overdueReceivables.source) && input.overdueReceivables.amount > input.overdueThresholdDkk) {
    alerts.push({ code: 'overdue_receivables_above_threshold', text: 'Forfaldne tilgodehavender er over det konfigurerede beløb.' })
  }
  return alerts
}

function customerQueue(rows: FinancePosition['invoices']): FinanceQueueItem[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.invoiceNumber,
    party: row.customerName,
    partyHref: row.customerId ? `/dashboard/customers/${row.customerId}` : null,
    documentHref: `/dashboard/invoices/${row.id}`,
    dueDate: row.dueDate,
    amount: Number.isFinite(row.amount) ? row.amount : null,
    amountLabel: 'Åbent' as const,
  }))
}

function supplierQueue(rows: FinancePosition['payables']): FinanceQueueItem[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.invoiceNumber || 'Uden nummer',
    party: row.supplierName,
    partyHref: row.supplierId ? `/dashboard/settings/suppliers/${row.supplierId}` : null,
    documentHref: `/dashboard/incoming-invoices/${row.id}`,
    dueDate: row.dueDate,
    amount: row.amount,
    amountLabel: 'Fakturabeløb' as const,
  }))
}

export function buildCashPosition(input: {
  today: string
  calculatedAt: string
  /** False when the user may not see this section. Hidden is not a failed read. */
  receivablesVisible?: boolean
  payablesVisible?: boolean
  receivablesLoaded: boolean
  payablesLoaded: boolean
  invoices: ReceivableInput[]
  payables: PayableInput[]
  bank: BookedBankInput
  minimumCashDkk?: number | null
  overdueThresholdDkk?: number | null
}): FinanceCashPosition {
  const receivablesVisible = input.receivablesVisible !== false
  const payablesVisible = input.payablesVisible !== false
  const ledger = buildFinancePosition({
    today: input.today,
    receivablesLoaded: input.receivablesLoaded,
    payablesLoaded: input.payablesLoaded,
    invoices: input.invoices,
    payables: input.payables,
  })
  const shownReceivable = (value: QualifiedAmount): QualifiedAmount => (receivablesVisible ? value : HIDDEN)
  const bookedBankBalance = qualifyBookedBank(input.bank)
  const openReceivables = shownReceivable(fromMoney(ledger.receivables, input.receivablesLoaded, 'Åbne udstedte fakturaer i DKK efter den eksisterende åbne-saldo-regel.'))
  const overdueReceivables = shownReceivable(fromMoney(ledger.overdueAmount, input.receivablesLoaded, 'Forfald før i dag og mindst 0,50 kr. Forfald i dag tæller ikke med.'))
  const openPayables = payableGap(payablesVisible, input.payablesLoaded)
  const overduePayables = payableGap(payablesVisible, input.payablesLoaded)
  const unscheduledReceivables = shownReceivable(sumInflows(ledger, ['undated'], input.receivablesLoaded, 'Åbne fakturaer uden forfaldsdato. De ligger ikke i 30, 60 eller 90 dage.'))
  const unscheduledPayables = payableGap(payablesVisible, input.payablesLoaded)
  const outgoing = payableGap(payablesVisible, input.payablesLoaded)
  const incoming = (days: 30 | 60 | 90, ids: ForecastId[]) => shownReceivable(sumInflows(
    ledger,
    ids,
    input.receivablesLoaded,
    `Åbne fakturaer med forfald inden for ${days} dage, inklusive allerede forfaldne. Uden forfaldsdato er ikke med.`,
  ))
  const horizon = (days: 30 | 60 | 90, ids: ForecastId[]): CashHorizon => {
    const expectedIncoming = incoming(days, ids)
    const projected = projectCash(bookedBankBalance, expectedIncoming, outgoing)
    return {
      days,
      openingCash: bookedBankBalance,
      expectedIncoming,
      expectedOutgoing: outgoing,
      projectedCash: projected,
      unscheduledReceivables,
      unscheduledPayables,
      quality: worstSource([bookedBankBalance.source, expectedIncoming.source, outgoing.source, unscheduledReceivables.source, unscheduledPayables.source]),
    }
  }
  const forecast30 = horizon(30, ['overdue', 'd30'])
  const forecast60 = horizon(60, ['overdue', 'd30', 'd60'])
  const forecast90 = horizon(90, ['overdue', 'd30', 'd60', 'd90'])
  const alerts = evaluateFinanceAlerts({
    booked: bookedBankBalance,
    projected30: forecast30.projectedCash,
    overdueReceivables,
    minimumCashDkk: input.minimumCashDkk ?? null,
    overdueThresholdDkk: input.overdueThresholdDkk ?? null,
    crmReadFailed: (receivablesVisible && !input.receivablesLoaded) || (payablesVisible && !input.payablesLoaded),
  })
  return {
    calculatedAt: input.calculatedAt,
    economicReadAt: input.bank.balance.outcome === 'known' ? input.bank.readAt : null,
    bookedBankBalance,
    actualBankBalance: ACTUAL_BANK,
    openReceivables,
    overdueReceivables,
    openPayables,
    overduePayables,
    receivablesAfter90: shownReceivable(sumInflows(ledger, ['later'], input.receivablesLoaded, 'Åbne fakturaer med forfald efter 90 dage. De indgår ikke i 90-dages-likviditeten.')),
    forecast30,
    forecast60,
    forecast90,
    overdueCustomerInvoices: customerQueue(ledger.invoices),
    upcomingCustomerInvoices: customerQueue(ledger.upcomingInvoices),
    overdueSupplierInvoices: supplierQueue(ledger.overduePayables),
    upcomingSupplierInvoices: supplierQueue(ledger.upcomingPayables),
    alerts,
    ledger,
  }
}

export function financeSections(perms: { has(key: Permission): boolean }): { desk: boolean; invoices: boolean; payables: boolean; bank: boolean; economic: boolean } {
  return {
    desk: perms.has('economy.view'),
    invoices: perms.has('invoices.view.all') || perms.has('invoices.view.own_cases'),
    payables: perms.has('incoming_invoices.view'),
    bank: perms.has('bank.view'),
    economic: perms.has('settings.economic'),
  }
}

export function configuredAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
