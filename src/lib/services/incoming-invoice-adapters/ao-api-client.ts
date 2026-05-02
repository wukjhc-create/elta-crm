/**
 * AO supplier-invoice adapter (Phase 15.3).
 *
 * AO doesn't expose an officially documented REST endpoint for B2B
 * customer invoices in the same way as their product API; in practice
 * this adapter is configured per agreement via:
 *
 *   supplier_credentials.api_endpoint              ← base URL
 *   supplier_credentials.credentials_encrypted     ← { username, password, api_key }
 *   process.env.AO_INVOICE_ENDPOINT_PATH           ← path appended to base
 *
 * If any of those are missing, the adapter returns
 * `{ invoices: [], skipped: true, skipReason: 'AO_INVOICE_API_NOT_CONFIGURED' }`
 * so the orchestrator can log+continue without failing the cron.
 *
 * The HTTP path is best-effort: it expects a JSON array of invoice
 * objects with `invoiceNumber`, `invoiceDate`, `amount`, `lines[]` etc.
 * Defensive normalisation handles different field-name variants.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredentials } from '@/lib/utils/encryption'
import { logger } from '@/lib/utils/logger'
import type {
  NormalisedInvoice,
  NormalisedInvoiceLine,
  SupplierInvoiceAdapter,
} from './types'

interface AoCredentials {
  username?: string
  password?: string
  api_key?: string
}

export class AOInvoiceAdapter implements SupplierInvoiceAdapter {
  readonly provider = 'AO' as const

  async fetchInvoices(opts: { sinceIso: string }): Promise<{
    invoices: NormalisedInvoice[]
    skipped: boolean
    skipReason?: string
  }> {
    try {
      const supabase = createAdminClient()
      const { data: cred } = await supabase
        .from('supplier_credentials')
        .select('id, api_endpoint, credentials_encrypted, is_active, supplier:supplier_id ( code )')
        .eq('credential_type', 'api')
        .eq('is_active', true)
      const aoCred = (cred ?? []).find((c) => {
        const sup = (c as { supplier?: { code?: string } | { code?: string }[] }).supplier
        const code = Array.isArray(sup) ? sup[0]?.code : sup?.code
        return (code || '').toUpperCase() === 'AO'
      })
      if (!aoCred) {
        return { invoices: [], skipped: true, skipReason: 'AO_INVOICE_API_NOT_CONFIGURED (no active AO credential)' }
      }

      const baseUrl = aoCred.api_endpoint || process.env.AO_INVOICE_API_BASE_URL || ''
      const path = process.env.AO_INVOICE_ENDPOINT_PATH || '/api/v1/invoices'
      if (!baseUrl) {
        return { invoices: [], skipped: true, skipReason: 'AO_INVOICE_API_NOT_CONFIGURED (no api_endpoint)' }
      }

      const decrypted = (await decryptCredentials(aoCred.credentials_encrypted)) as AoCredentials
      if (!decrypted.api_key && !decrypted.username) {
        return { invoices: [], skipped: true, skipReason: 'AO_INVOICE_API_NOT_CONFIGURED (no api_key or username)' }
      }

      const url = `${baseUrl.replace(/\/+$/, '')}${path}?since=${encodeURIComponent(opts.sinceIso)}`

      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': 'Elta-CRM/1.0',
      }
      if (decrypted.api_key) headers['Authorization'] = `Bearer ${decrypted.api_key}`
      else if (decrypted.username && decrypted.password) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${decrypted.username}:${decrypted.password}`).toString('base64')
      }

      let res: Response
      try {
        res = await fetch(url, { method: 'GET', headers })
      } catch (err) {
        logger.warn('AO invoice fetch threw — adapter exits skipped', { error: err })
        return { invoices: [], skipped: true, skipReason: `AO fetch threw: ${err instanceof Error ? err.message : String(err)}` }
      }

      if (!res.ok) {
        const body = (await res.text()).slice(0, 300)
        logger.warn('AO invoice fetch HTTP error', { metadata: { status: res.status, body } })
        return { invoices: [], skipped: true, skipReason: `AO HTTP ${res.status}: ${body}` }
      }

      const json = (await res.json().catch(() => null)) as unknown
      if (!Array.isArray(json)) {
        return { invoices: [], skipped: true, skipReason: 'AO response not an array' }
      }

      const invoices: NormalisedInvoice[] = []
      for (const raw of json) {
        const inv = normaliseAoInvoice(raw)
        if (inv) invoices.push(inv)
      }
      return { invoices, skipped: false }
    } catch (err) {
      logger.error('AO adapter top-level threw', { error: err instanceof Error ? err : new Error(String(err)) })
      return {
        invoices: [],
        skipped: true,
        skipReason: `AO adapter threw: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }
}

// =====================================================
// Normalisation
// =====================================================

function normaliseAoInvoice(raw: unknown): NormalisedInvoice | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const invoiceNumber = String(r.invoiceNumber ?? r.invoice_number ?? r.number ?? '').trim()
  if (!invoiceNumber) return null

  const linesRaw = (r.lines ?? r.invoiceLines ?? r.items ?? []) as unknown[]
  const lines: NormalisedInvoiceLine[] = (Array.isArray(linesRaw) ? linesRaw : []).map((l, i) => {
    const x = (l ?? {}) as Record<string, unknown>
    return {
      lineNumber: Number(x.lineNumber ?? x.line_number ?? i + 1),
      description: stringOrNull(x.description ?? x.text),
      quantity: numberOrNull(x.quantity ?? x.qty),
      unit: stringOrNull(x.unit),
      unitPrice: numberOrNull(x.unitPrice ?? x.unit_price ?? x.price),
      totalPrice: numberOrNull(x.totalPrice ?? x.total_price ?? x.amount),
      supplierProductCode: stringOrNull(x.sku ?? x.productCode ?? x.product_code ?? x.itemNumber),
    }
  })

  const supplierOrderRefs: string[] = []
  for (const k of ['orderNumber', 'order_number', 'orderRef', 'order_ref', 'ordrenr']) {
    const v = stringOrNull(r[k])
    if (v) supplierOrderRefs.push(v)
  }
  const workOrderHints: string[] = []
  for (const k of ['caseRef', 'case_ref', 'reference', 'customerReference', 'customer_reference']) {
    const v = stringOrNull(r[k])
    if (v) workOrderHints.push(v)
  }

  const rawText = JSON.stringify(raw)

  return {
    invoiceNumber,
    invoiceDate: isoDate(r.invoiceDate ?? r.invoice_date ?? r.date),
    dueDate: isoDate(r.dueDate ?? r.due_date),
    currency: String(r.currency ?? 'DKK').toUpperCase(),
    amountExclVat: numberOrNull(r.amountExclVat ?? r.amount_excl_vat ?? r.netAmount),
    vatAmount: numberOrNull(r.vatAmount ?? r.vat_amount ?? r.vat),
    amountInclVat: numberOrNull(r.amountInclVat ?? r.amount_incl_vat ?? r.totalAmount ?? r.amount),
    paymentReference: stringOrNull(r.paymentReference ?? r.payment_reference ?? r.fik ?? r.ean),
    iban: stringOrNull(r.iban),
    rawText,
    fileUrl: stringOrNull(r.pdfUrl ?? r.pdf_url ?? r.fileUrl ?? r.file_url),
    fileName: stringOrNull(r.fileName ?? r.file_name),
    mimeType: r.mimeType ? String(r.mimeType) : (r.fileUrl || r.pdf_url ? 'application/pdf' : null),
    supplierOrderRefs: Array.from(new Set(supplierOrderRefs)),
    workOrderHints: Array.from(new Set(workOrderHints)),
    lines,
  }
}

function stringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function isoDate(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (m) {
    const [, d, mo, y] = m
    const yy = y.length === 2 ? `20${y}` : y
    return `${yy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null
}
