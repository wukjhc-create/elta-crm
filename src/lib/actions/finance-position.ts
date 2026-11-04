'use server'

import { BOOKKEEPING_FOUNDATION, type PayableInput, type ReceivableInput } from '@/lib/finance/position'
import { buildCashPosition, configuredAmount, financeSections, type BookedBankInput, type FinanceCashPosition } from '@/lib/finance/cash-position'
import { readAccountingYears, readBankAccountBalance } from '@/lib/economic/read'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { permissionDeniedText } from '@/lib/auth/permission-text'
import { getEconomicSettings, isEconomicReady } from '@/lib/services/economic-client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export type EconomicCashView =
  | { visible: false }
  | { visible: true; state: 'not_configured'; message: string }
  | { visible: true; state: 'no_account'; message: string }
  | { visible: true; state: 'known'; account: number; amount: number }
  | { visible: true; state: 'unknown'; message: string }

export interface FinanceDesk {
  ok: true
  scopeAll: boolean
  seesInvoices: boolean
  seesPayables: boolean
  position: FinanceCashPosition['ledger']
  cash: FinanceCashPosition
  customerNamesKnown: boolean
  bank: { visible: false } | { visible: true; unmatched: number | null }
  economic: EconomicCashView
  bookkeeping: typeof BOOKKEEPING_FOUNDATION
}

export async function loadFinanceDesk(): Promise<FinanceDesk | { ok: false; message: string }> {
  const ctx = await getAuthenticatedClientWithRole()
  if (!ctx.hasPermission('economy.view')) {
    return { ok: false, message: permissionDeniedText('economy.view') }
  }

  const sections = financeSections(ctx.permissions)
  const seesInvoices = sections.invoices
  const seesPayables = sections.payables
  const now = new Date()
  const today = copenhagenParts(now).date

  let invoices: ReceivableInput[] = []
  let receivablesLoaded = false
  let customerNamesKnown = true
  if (seesInvoices) {
    try {
      const rows = await fetchAllRows<{
        id: string
        invoice_number: string | null
        customer_id: string | null
        status: string | null
        invoice_type: string | null
        voided_at: string | null
        currency: string | null
        final_amount: number | string | null
        amount_paid: number | string | null
        due_date: string | null
        credit_of_invoice_id: string | null
      }>((from, to) => ctx.supabase
        .from('invoices')
        .select('id, invoice_number, customer_id, status, invoice_type, voided_at, currency, final_amount, amount_paid, due_date, credit_of_invoice_id')
        .order('id')
        .range(from, to))
      const ids = Array.from(new Set(rows.map((row) => row.customer_id).filter((id): id is string => !!id)))
      const names = new Map<string, string>()
      try {
        for (let i = 0; i < ids.length; i += 200) {
          const { data, error } = await ctx.supabase.from('customers').select('id, company_name').in('id', ids.slice(i, i + 200))
          if (error) throw new Error(error.message)
          for (const customer of data ?? []) names.set(customer.id as string, (customer.company_name as string) || '')
        }
      } catch {
        customerNamesKnown = false
      }
      invoices = rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number || row.id,
        customerId: row.customer_id,
        customerName: row.customer_id && names.has(row.customer_id) ? names.get(row.customer_id)! : null,
        status: row.status,
        invoiceType: row.invoice_type,
        voidedAt: row.voided_at,
        currency: row.currency,
        finalAmount: row.final_amount,
        amountPaid: row.amount_paid,
        dueDate: row.due_date,
        creditOfInvoiceId: row.credit_of_invoice_id,
      }))
      receivablesLoaded = true
    } catch {
      receivablesLoaded = false
      customerNamesKnown = false
    }
  }

  let payables: PayableInput[] = []
  let payablesLoaded = false
  if (seesPayables) {
    try {
      const rows = await fetchAllRows<{
        id: string
        invoice_number: string | null
        supplier_name_extracted: string | null
        status: string | null
        currency: string | null
        amount_incl_vat: number | string | null
        due_date: string | null
        duplicate_of_id: string | null
        supplier_id: string | null
      }>((from, to) => ctx.supabase
        .from('incoming_invoices')
        .select('id, invoice_number, supplier_name_extracted, status, currency, amount_incl_vat, due_date, duplicate_of_id, supplier_id')
        .order('id')
        .range(from, to))
      payables = rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        supplierName: row.supplier_name_extracted,
        supplierId: row.supplier_id,
        status: row.status,
        currency: row.currency,
        amountInclVat: row.amount_incl_vat,
        dueDate: row.due_date,
        duplicateOfId: row.duplicate_of_id,
      }))
      payablesLoaded = true
    } catch {
      payablesLoaded = false
    }
  }

  let bank: FinanceDesk['bank'] = { visible: false }
  if (ctx.hasPermission('bank.view')) {
    const { count, error } = await ctx.supabase
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('match_status', 'unmatched')
    bank = { visible: true, unmatched: error || count == null ? null : count }
  }

  const bankRead = await loadBookedBank(sections.economic, now.getTime())
  const cash = buildCashPosition({
    today,
    calculatedAt: now.toISOString(),
    receivablesLoaded,
    payablesLoaded,
    invoices,
    payables,
    bank: bankRead.bank,
    minimumCashDkk: bankRead.minimumCashDkk,
    overdueThresholdDkk: bankRead.overdueThresholdDkk,
  })

  return {
    ok: true,
    scopeAll: sections.invoices && ctx.hasPermission('invoices.view.all'),
    seesInvoices,
    seesPayables,
    position: cash.ledger,
    cash,
    customerNamesKnown,
    bank,
    economic: economicView(bankRead.bank),
    bookkeeping: BOOKKEEPING_FOUNDATION,
  }
}

function economicView(bank: BookedBankInput): EconomicCashView {
  if (!bank.permitted) return { visible: false }
  if (!bank.credentialsReady) return { visible: true, state: 'not_configured', message: 'e-conomic er ikke opsat. Der hentes ingen tal.' }
  if (bank.balance.outcome === 'known' && bank.accountNumber != null) {
    return { visible: true, state: 'known', account: bank.accountNumber, amount: bank.balance.amount }
  }
  if (bank.accountNumber == null && bank.probe === 'ok') {
    return { visible: true, state: 'no_account', message: 'e-conomic svarede. Bankkonto er ikke valgt i opsætningen, så saldoen vises ikke.' }
  }
  return { visible: true, state: 'unknown', message: 'e-conomic kunne ikke læses. Saldoen er ukendt.' }
}

async function loadBookedBank(permitted: boolean, nowMs: number): Promise<{ bank: BookedBankInput; minimumCashDkk: number | null; overdueThresholdDkk: number | null }> {
  const bank: BookedBankInput = {
    permitted,
    credentialsReady: false,
    accountNumber: null,
    probe: 'not_needed',
    balance: { outcome: 'not_read' },
    readAt: null,
    nowMs,
  }
  if (!permitted) return { bank, minimumCashDkk: null, overdueThresholdDkk: null }
  const settings = await getEconomicSettings()
  const config = settings?.config
  const minimumCashDkk = configuredAmount(config && typeof config === 'object' ? (config as { liquidityMinimumDkk?: unknown }).liquidityMinimumDkk : null)
  const overdueThresholdDkk = configuredAmount(config && typeof config === 'object' ? (config as { overdueReceivablesAlertDkk?: unknown }).overdueReceivablesAlertDkk : null)
  if (!isEconomicReady(settings)) return { bank, minimumCashDkk, overdueThresholdDkk }
  bank.credentialsReady = true
  const account = config?.bankContraAccountNumber
  if (typeof account !== 'number' || !Number.isInteger(account) || account <= 0) {
    const probe = await readAccountingYears()
    bank.probe = probe.ok ? 'ok' : probe.reason === 'timeout' ? 'timeout' : 'failed'
    return { bank, minimumCashDkk, overdueThresholdDkk }
  }
  bank.accountNumber = account
  const balance = await readBankAccountBalance(account)
  if (balance.state === 'known') {
    bank.balance = { outcome: 'known', amount: balance.amount }
    bank.readAt = new Date(nowMs).toISOString()
  } else if (balance.reason === 'timeout') {
    bank.balance = { outcome: 'timeout' }
  } else if (balance.reason === 'missing_balance') {
    bank.balance = { outcome: 'missing_balance' }
  } else {
    bank.balance = { outcome: 'failed' }
  }
  return { bank, minimumCashDkk, overdueThresholdDkk }
}
