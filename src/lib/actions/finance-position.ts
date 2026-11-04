'use server'

import { BOOKKEEPING_FOUNDATION, buildFinancePosition, type FinancePosition, type PayableInput, type ReceivableInput } from '@/lib/finance/position'
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
  position: FinancePosition
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

  const seesInvoices = ctx.hasPermission('invoices.view.all') || ctx.hasPermission('invoices.view.own_cases')
  const seesPayables = ctx.hasPermission('incoming_invoices.view')
  const today = copenhagenParts(new Date()).date

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
      }>((from, to) => ctx.supabase
        .from('incoming_invoices')
        .select('id, invoice_number, supplier_name_extracted, status, currency, amount_incl_vat, due_date, duplicate_of_id')
        .order('id')
        .range(from, to))
      payables = rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        supplierName: row.supplier_name_extracted,
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

  const economic = await economicCash(ctx.hasPermission('settings.economic'))
  const position = buildFinancePosition({ today, receivablesLoaded, payablesLoaded, invoices, payables })

  return {
    ok: true,
    scopeAll: ctx.hasPermission('invoices.view.all'),
    seesInvoices,
    seesPayables,
    position,
    customerNamesKnown,
    bank,
    economic,
    bookkeeping: BOOKKEEPING_FOUNDATION,
  }
}

async function economicCash(allowed: boolean): Promise<EconomicCashView> {
  if (!allowed) return { visible: false }
  const settings = await getEconomicSettings()
  if (!isEconomicReady(settings)) {
    return { visible: true, state: 'not_configured', message: 'e-conomic er ikke opsat. Der hentes ingen tal.' }
  }
  const account = settings.config?.bankContraAccountNumber
  if (typeof account !== 'number' || !Number.isInteger(account) || account <= 0) {
    const probe = await readAccountingYears()
    if (!probe.ok) return { visible: true, state: 'unknown', message: 'e-conomic kunne ikke læses. Saldoen er ukendt.' }
    return {
      visible: true,
      state: 'no_account',
      message: 'e-conomic svarede. Bankkonto er ikke valgt i opsætningen, så saldoen vises ikke.',
    }
  }
  const balance = await readBankAccountBalance(account)
  if (balance.state !== 'known') {
    return { visible: true, state: 'unknown', message: balance.message || 'Saldoen kunne ikke læses.' }
  }
  return { visible: true, state: 'known', account, amount: balance.amount }
}
