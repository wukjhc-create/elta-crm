/**
 * Lemvigh-Müller invoice adapter (Phase 15.3).
 *
 * LM uses SFTP rather than a REST API. Customer invoices are typically
 * dropped to `/FromLEMU/invoic/` (EDI/CSV) — this adapter:
 *
 *   1. Reads SFTP credentials from supplier_credentials (type='ftp')
 *   2. Lists files in the configured invoice directory
 *   3. Downloads each file (text content) and produces one
 *      NormalisedInvoice per file
 *
 * Skip-safe: returns `{ invoices: [], skipped: true, skipReason }`
 * when credentials are missing, the directory is empty, or SFTP throws.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decryptCredentials } from '@/lib/utils/encryption'
import { logger } from '@/lib/utils/logger'
import { parseSupplierInvoiceText } from '@/lib/services/incoming-invoice-parser'
import type {
  NormalisedInvoice,
  SupplierInvoiceAdapter,
} from './types'

interface LmCredentials {
  username?: string
  password?: string
  host?: string
}

const DEFAULT_INVOICE_DIR = '/FromLEMU/invoic'
const DEFAULT_PORT = 22

export class LemvigInvoiceAdapter implements SupplierInvoiceAdapter {
  readonly provider = 'LM' as const

  async fetchInvoices(opts: { sinceIso: string }): Promise<{
    invoices: NormalisedInvoice[]
    skipped: boolean
    skipReason?: string
  }> {
    try {
      const supabase = createAdminClient()
      const { data: credList } = await supabase
        .from('supplier_credentials')
        .select('id, api_endpoint, credentials_encrypted, is_active, supplier:supplier_id ( code )')
        .eq('credential_type', 'ftp')
        .eq('is_active', true)
      const lmCred = (credList ?? []).find((c) => {
        const sup = (c as { supplier?: { code?: string } | { code?: string }[] }).supplier
        const code = Array.isArray(sup) ? sup[0]?.code : sup?.code
        return (code || '').toUpperCase() === 'LM'
      })
      if (!lmCred) {
        return { invoices: [], skipped: true, skipReason: 'LM_INVOICE_API_NOT_CONFIGURED (no active LM ftp credential)' }
      }

      const decrypted = (await decryptCredentials(lmCred.credentials_encrypted)) as LmCredentials
      const host = lmCred.api_endpoint || decrypted.host
      const username = decrypted.username
      const password = decrypted.password
      if (!host || !username || !password) {
        return { invoices: [], skipped: true, skipReason: 'LM_INVOICE_API_NOT_CONFIGURED (missing host/username/password)' }
      }

      const dir = process.env.LM_INVOICE_DIR || DEFAULT_INVOICE_DIR
      const sinceMs = Date.parse(opts.sinceIso) || (Date.now() - 30 * 24 * 60 * 60 * 1000)

      const files = await listSftpFiles({ host, port: DEFAULT_PORT, username, password, dir })
      if (files === null) {
        return { invoices: [], skipped: true, skipReason: 'LM SFTP listing failed' }
      }
      const fresh = files.filter((f) => !f.isDir && f.mtimeMs >= sinceMs)
      if (fresh.length === 0) {
        return { invoices: [], skipped: true, skipReason: 'LM no invoice files in window' }
      }

      const invoices: NormalisedInvoice[] = []
      for (const f of fresh) {
        try {
          const content = await downloadSftpFile({ host, port: DEFAULT_PORT, username, password, path: `${dir}/${f.name}` })
          if (!content || content.trim().length < 50) continue
          const parsed = parseSupplierInvoiceText(content)
          // We need an invoice number — reject if parser couldn't find one.
          if (!parsed.invoiceNumber) continue
          invoices.push({
            invoiceNumber: parsed.invoiceNumber,
            invoiceDate: parsed.invoiceDate,
            dueDate: parsed.dueDate,
            currency: parsed.currency,
            amountExclVat: parsed.amountExclVat,
            vatAmount: parsed.vatAmount,
            amountInclVat: parsed.amountInclVat,
            paymentReference: parsed.paymentReference,
            iban: parsed.iban,
            rawText: content,
            fileUrl: null,
            fileName: f.name,
            mimeType: 'text/edi',
            supplierOrderRefs: parsed.supplierOrderRefs,
            workOrderHints: parsed.workOrderHints,
            lines: [],
          })
        } catch (err) {
          logger.warn('LM invoice file processing failed (skipped)', { metadata: { file: f.name }, error: err })
        }
      }

      return { invoices, skipped: false }
    } catch (err) {
      logger.error('LM adapter top-level threw', { error: err instanceof Error ? err : new Error(String(err)) })
      return {
        invoices: [],
        skipped: true,
        skipReason: `LM adapter threw: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }
}

// =====================================================
// SFTP helpers — wrap ssh2 in tiny promise-based functions so the
// adapter never crashes on a malformed file or network blip.
// =====================================================

interface SftpConn {
  host: string
  port: number
  username: string
  password: string
}

interface SftpEntry {
  name: string
  isDir: boolean
  size: number
  mtimeMs: number
}

async function listSftpFiles(c: SftpConn & { dir: string }): Promise<SftpEntry[] | null> {
  return new Promise<SftpEntry[] | null>(async (resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const ssh2: any = await import('ssh2')
      const Client = ssh2.Client
      const conn = new Client()
      const timeout = setTimeout(() => { conn.end(); resolve(null) }, 20000)

      conn.on('ready', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conn.sftp((err: Error | null, sftp: any) => {
          if (err) { clearTimeout(timeout); conn.end(); return resolve(null) }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sftp.readdir(c.dir, (e2: Error | null, list: any[]) => {
            clearTimeout(timeout)
            conn.end()
            if (e2 || !list) return resolve(null)
            const out: SftpEntry[] = list.map((entry) => ({
              name: entry.filename,
              isDir: typeof entry.longname === 'string' && entry.longname.startsWith('d'),
              size: Number(entry.attrs?.size) || 0,
              mtimeMs: (Number(entry.attrs?.mtime) || 0) * 1000,
            }))
            resolve(out)
          })
        })
      })
      conn.on('error', () => { clearTimeout(timeout); resolve(null) })
      conn.connect({
        host: c.host,
        port: c.port,
        username: c.username,
        password: c.password,
        readyTimeout: 15000,
        tryKeyboard: true,
      })
    } catch {
      resolve(null)
    }
  })
}

async function downloadSftpFile(c: SftpConn & { path: string }): Promise<string | null> {
  return new Promise<string | null>(async (resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const ssh2: any = await import('ssh2')
      const Client = ssh2.Client
      const conn = new Client()
      const timeout = setTimeout(() => { conn.end(); resolve(null) }, 30000)

      conn.on('ready', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conn.sftp((err: Error | null, sftp: any) => {
          if (err) { clearTimeout(timeout); conn.end(); return resolve(null) }
          const chunks: Buffer[] = []
          const stream = sftp.createReadStream(c.path)
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('end', () => {
            clearTimeout(timeout)
            conn.end()
            try {
              resolve(Buffer.concat(chunks).toString('utf8'))
            } catch {
              resolve(null)
            }
          })
          stream.on('error', () => { clearTimeout(timeout); conn.end(); resolve(null) })
        })
      })
      conn.on('error', () => { clearTimeout(timeout); resolve(null) })
      conn.connect({
        host: c.host,
        port: c.port,
        username: c.username,
        password: c.password,
        readyTimeout: 15000,
        tryKeyboard: true,
      })
    } catch {
      resolve(null)
    }
  })
}
