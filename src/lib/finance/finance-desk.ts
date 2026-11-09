/**
 * Loads the finance page and the dashboard alert tile for one user. Not a server action.
 * CRM reads use the user's own client, so RLS and scope apply. e-conomic settings are read only after settings.economic.
 * A failed read is never passed on as an empty list.
 */
import { BOOKKEEPING_FOUNDATION, buildFinancePosition, type PayableInput, type ReceivableInput } from '@/lib/finance/position'
import { buildCashPosition, configuredAmount, financeSections, type BookedBankInput, type CreditorParty, type FinanceCashPosition } from '@/lib/finance/cash-position'
import type { Permission } from '@/lib/auth/permissions'
import { permissionDeniedText } from '@/lib/auth/permission-text'
import { readAccountingYears, readBankAccountBalance, readOpenSupplierRemainders, type BankBalanceRead, type EconomicProbe } from '@/lib/economic/read'
import { matchIncomingInvoice, matchSupplier, type CreditorRead, type InvoiceLink, type SupplierLink } from '@/lib/economic/supplier-remainder'
import { isEconomicReady, readEconomicSettings, type EconomicSettingsRead, type ReadyEconomicSettings } from '@/lib/services/economic-client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { copenhagenParts } from '@/lib/utils/copenhagen-time'

export interface FinanceCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any }
  hasPermission: (key: Permission) => boolean
  permissions: { has(key: Permission): boolean }
}

export interface FinanceDeps {
  readSettings: () => Promise<EconomicSettingsRead>
  readBalance: (settings: ReadyEconomicSettings, account: number) => Promise<BankBalanceRead>
  readYears: (settings: ReadyEconomicSettings) => Promise<EconomicProbe>
  /** Optional so a caller that only reads the booked balance does not have to supply it. The page does. */
  readCreditors?: (settings: ReadyEconomicSettings, today: string) => Promise<CreditorRead>
}

export const ECONOMIC_DEPS: FinanceDeps = {
  readSettings: readEconomicSettings,
  readBalance: readBankAccountBalance,
  readYears: readAccountingYears,
  readCreditors: readOpenSupplierRemainders,
}

export interface FinanceDesk {
  ok: true
  scopeAll: boolean
  seesInvoices: boolean
  seesPayables: boolean
  seesEconomic: boolean
  position: FinanceCashPosition['ledger']
  cash: FinanceCashPosition
  customerNamesKnown: boolean
  /** False only when a finished creditor read could not load the supplier list. Amounts are unchanged. */
  creditorSuppliersKnown: boolean
  /** False only when a finished creditor read could not load incoming-invoice links. Amounts are unchanged. */
  creditorInvoicesKnown: boolean
  bank: { visible: false } | { visible: true; unmatched: number | null }
  bookkeeping: typeof BOOKKEEPING_FOUNDATION
}

interface InvoiceRow {
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
}

function readInvoiceRows(supabase: FinanceCtx['supabase']): Promise<InvoiceRow[]> {
  return fetchAllRows<InvoiceRow>((from, to) => supabase
    .from('invoices')
    .select('id, invoice_number, customer_id, status, invoice_type, voided_at, currency, final_amount, amount_paid, due_date, credit_of_invoice_id')
    .order('id')
    .range(from, to))
}

function toReceivable(row: InvoiceRow, names: Map<string, string>): ReceivableInput {
  return {
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
  }
}

function thresholdsFrom(config: unknown): { minimumCashDkk: number | null; overdueThresholdDkk: number | null } {
  const c = config && typeof config === 'object' ? (config as { liquidityMinimumDkk?: unknown; overdueReceivablesAlertDkk?: unknown }) : {}
  return { minimumCashDkk: configuredAmount(c.liquidityMinimumDkk), overdueThresholdDkk: configuredAmount(c.overdueReceivablesAlertDkk) }
}

export async function buildFinanceDesk(ctx: FinanceCtx, deps: FinanceDeps, now: Date = new Date()): Promise<FinanceDesk | { ok: false; message: string }> {
  if (!ctx.hasPermission('economy.view')) {
    return { ok: false, message: permissionDeniedText('economy.view') }
  }

  const sections = financeSections(ctx.permissions)
  const seesInvoices = sections.invoices
  const seesPayables = sections.payables
  const scopeAll = seesInvoices && ctx.hasPermission('invoices.view.all')
  const today = copenhagenParts(now).date

  let invoices: ReceivableInput[] = []
  let receivablesLoaded = false
  let customerNamesKnown = true
  if (seesInvoices) {
    try {
      const rows = await readInvoiceRows(ctx.supabase)
      const ids = Array.from(new Set(rows.map((row) => row.customer_id).filter((id): id is string => !!id)))
      const names = new Map<string, string>()
      try {
        for (let i = 0; i < ids.length; i += 200) {
          const { data, error } = await ctx.supabase.from('customers').select('id, company_name').in('id', ids.slice(i, i + 200))
          if (error) throw new Error('customers')
          for (const customer of (data ?? []) as Array<{ id: string; company_name: string | null }>) names.set(customer.id, customer.company_name || '')
        }
      } catch {
        customerNamesKnown = false
      }
      invoices = rows.map((row) => toReceivable(row, names))
      receivablesLoaded = true
    } catch {
      receivablesLoaded = false
      customerNamesKnown = false
    }
  }

  let payables: PayableInput[] = []
  let payablesLoaded = false
  let loadedInvoiceLinks: InvoiceLink[] | null = null
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
        external_invoice_id: string | null
        external_provider: string | null
      }>((from, to) => ctx.supabase
        .from('incoming_invoices')
        .select('id, invoice_number, supplier_name_extracted, status, currency, amount_incl_vat, due_date, duplicate_of_id, supplier_id, external_invoice_id, external_provider')
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
      loadedInvoiceLinks = rows.map((row) => ({
        id: row.id,
        supplierId: row.supplier_id,
        externalInvoiceId: row.external_invoice_id,
        externalProvider: row.external_provider,
      }))
      payablesLoaded = true
    } catch {
      payablesLoaded = false
      loadedInvoiceLinks = null
    }
  }

  let bank: FinanceDesk['bank'] = { visible: false }
  if (sections.bank) {
    try {
      const { count, error } = await ctx.supabase
        .from('bank_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('match_status', 'unmatched')
      bank = { visible: true, unmatched: error || count == null ? null : count }
    } catch {
      bank = { visible: true, unmatched: null }
    }
  }

  const bankRead = await loadBookedBank(sections.economic, now, deps)
  const creditorRead = await loadCreditors(seesPayables && sections.economic, bankRead, today, deps)
  const links = await creditorLinks(ctx, creditorRead.creditors, payablesLoaded, loadedInvoiceLinks)
  const cash = buildCashPosition({
    today,
    calculatedAt: now.toISOString(),
    receivablesVisible: seesInvoices,
    payablesVisible: seesPayables,
    receivablesLoaded,
    payablesLoaded,
    invoices,
    payables,
    bank: bankRead.bank,
    creditors: creditorRead.creditors,
    creditorParty: links.party,
    minimumCashDkk: bankRead.minimumCashDkk,
    // A company threshold compared with one user's scoped invoices would say nothing
    overdueThresholdDkk: scopeAll ? bankRead.overdueThresholdDkk : null,
  })

  return {
    ok: true,
    scopeAll,
    seesInvoices,
    seesPayables,
    seesEconomic: sections.economic,
    position: cash.ledger,
    cash,
    customerNamesKnown,
    creditorSuppliersKnown: links.suppliersKnown,
    creditorInvoicesKnown: links.invoicesKnown,
    bank,
    bookkeeping: BOOKKEEPING_FOUNDATION,
  }
}

const SUPPLIER_MATCH_CAP = 200_000

async function loadCreditors(
  permitted: boolean,
  bankRead: { settingsFailed: boolean; readySettings: ReadyEconomicSettings | null },
  today: string,
  deps: FinanceDeps,
): Promise<{ creditors: CreditorRead }> {
  if (!permitted || !deps.readCreditors) return { creditors: { state: 'not_read' } }
  if (bankRead.settingsFailed) return { creditors: { state: 'error' } }
  if (!bankRead.readySettings) return { creditors: { state: 'not_read' } }
  try {
    return { creditors: await deps.readCreditors(bankRead.readySettings, today) }
  } catch {
    return { creditors: { state: 'error' } }
  }
}

async function creditorLinks(
  ctx: FinanceCtx,
  creditors: CreditorRead,
  payablesLoaded: boolean,
  loadedInvoiceLinks: InvoiceLink[] | null,
): Promise<{ party?: CreditorParty; suppliersKnown: boolean; invoicesKnown: boolean }> {
  if (creditors.state !== 'known' || creditors.items.length === 0) {
    return { suppliersKnown: true, invoicesKnown: true }
  }
  let suppliers: SupplierLink[] | null = null
  let suppliersKnown = true
  try {
    const rows = await fetchAllRows<{ id: string; name: string | null; external_supplier_id: string | null; external_provider: string | null }>((from, to) => ctx.supabase
      .from('suppliers')
      .select('id, name, external_supplier_id, external_provider')
      .order('id')
      .range(from, to))
    if (rows.length >= SUPPLIER_MATCH_CAP) suppliersKnown = false
    else suppliers = rows.map((row) => ({ id: row.id, name: row.name, externalSupplierId: row.external_supplier_id, externalProvider: row.external_provider }))
  } catch {
    suppliersKnown = false
  }
  const invoicesKnown = payablesLoaded && loadedInvoiceLinks != null
  const invoices = invoicesKnown ? loadedInvoiceLinks : null
  const party: CreditorParty = (item) => {
    const supplier = matchSupplier(item.supplierNumber, suppliersKnown ? suppliers : null)
    const invoiceId = matchIncomingInvoice(item, supplier, invoices)
    if (supplier.state !== 'matched') {
      return { party: `Leverandør ${item.supplierNumber}`, partyHref: null, documentHref: null }
    }
    return {
      party: supplier.name,
      partyHref: `/dashboard/settings/suppliers/${supplier.supplierId}`,
      documentHref: invoiceId ? `/dashboard/incoming-invoices/${invoiceId}` : null,
    }
  }
  return { party, suppliersKnown, invoicesKnown }
}

async function loadBookedBank(permitted: boolean, now: Date, deps: FinanceDeps): Promise<{ bank: BookedBankInput; minimumCashDkk: number | null; overdueThresholdDkk: number | null; settingsFailed: boolean; readySettings: ReadyEconomicSettings | null }> {
  const bank: BookedBankInput = {
    permitted,
    credentialsReady: false,
    accountNumber: null,
    probe: 'not_needed',
    balance: { outcome: 'not_read' },
    readAt: null,
  }
  const none = { minimumCashDkk: null, overdueThresholdDkk: null, settingsFailed: false, readySettings: null as ReadyEconomicSettings | null }
  // Without settings.economic the encrypted settings row is not touched at all
  if (!permitted) return { bank, ...none }
  const read = await deps.readSettings()
  if (read.state === 'error') return { bank: { ...bank, settingsFailed: true }, ...none, settingsFailed: true }
  if (read.state === 'missing') return { bank, ...none }
  const settings = read.settings
  const thresholds = thresholdsFrom(settings.config)
  if (!isEconomicReady(settings)) return { bank, ...thresholds, settingsFailed: false, readySettings: null }
  bank.credentialsReady = true
  try {
    const account = settings.config?.bankContraAccountNumber
    if (typeof account !== 'number' || !Number.isSafeInteger(account) || account <= 0) {
      const probe = await deps.readYears(settings)
      bank.probe = probe.ok ? 'ok' : probe.reason
      return { bank, ...thresholds, settingsFailed: false, readySettings: settings }
    }
    bank.accountNumber = account
    const balance = await deps.readBalance(settings, account)
    if (balance.state === 'known') {
      bank.balance = { outcome: 'known', amount: balance.amount }
      bank.accountName = balance.accountName
      bank.readAt = now.toISOString()
    } else {
      bank.balance = { outcome: balance.reason }
    }
  } catch {
    bank.balance = { outcome: 'failed' }
    if (bank.accountNumber == null) bank.probe = 'failed'
  }
  return { bank, ...thresholds, settingsFailed: false, readySettings: settings }
}

export type FinanceAlertTile =
  | { state: 'hidden' }
  | { state: 'ok'; count: number; href: string; note: string }
  | { state: 'unknown'; href: string; note: string }

const TILE_HREF = '/dashboard/finance'

/**
 * Dashboard tile. Runs on every dashboard load, so it never calls e-conomic and never reads creditor remainders.
 * It reads invoices only when a threshold is set. The minimum-cash check cannot run here. With nothing to
 * evaluate the tile is hidden: "0 alerts" would claim a check that did not happen.
 */
export async function buildFinanceAlertTile(ctx: FinanceCtx, readSettings: FinanceDeps['readSettings'], now: Date = new Date()): Promise<FinanceAlertTile> {
  if (!ctx.hasPermission('economy.view') || !ctx.hasPermission('settings.economic') || !ctx.hasPermission('invoices.view.all')) return { state: 'hidden' }
  const failed: FinanceAlertTile = { state: 'unknown', href: TILE_HREF, note: 'Likviditeten kunne ikke læses. Det tælles ikke som nul.' }
  const read = await readSettings()
  if (read.state === 'error') return failed
  if (read.state === 'missing') return { state: 'hidden' }
  const { overdueThresholdDkk } = thresholdsFrom(read.settings.config)
  if (overdueThresholdDkk == null) return { state: 'hidden' }
  try {
    const rows = await readInvoiceRows(ctx.supabase)
    const position = buildFinancePosition({
      today: copenhagenParts(now).date,
      receivablesLoaded: true,
      payablesLoaded: false,
      invoices: rows.map((row) => toReceivable(row, new Map())),
      payables: [],
    })
    if (position.overdueAmount.state === 'unknown') return { state: 'unknown', href: TILE_HREF, note: 'Et fakturabeløb mangler. Det tælles ikke som nul.' }
    const over = position.overdueAmount.amount > overdueThresholdDkk
    return { state: 'ok', count: over ? 1 : 0, href: TILE_HREF, note: over ? 'Forfaldne tilgodehavender er over det konfigurerede beløb. Der sendes ingen besked.' : 'Forfaldne tilgodehavender er inden for det konfigurerede beløb. Minimumskassen kan ikke vurderes.' }
  } catch {
    return failed
  }
}
