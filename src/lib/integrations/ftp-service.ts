/**
 * FTP Import Service
 *
 * Thin orchestration facade that wraps existing FTP infrastructure:
 *   - supplier-ftp-sync.ts (FTP download + parse)
 *   - Cron route upsert logic (product insert/update)
 *
 * Provides a single `importFromFtp()` function for manual or automated triggers.
 */

import { createClient } from '@supabase/supabase-js'
import { executeFtpSync, buildFtpCredentials } from '@/lib/services/supplier-ftp-sync'
import { decryptCredentials } from '@/lib/utils/encryption'
import { BATCH_CONFIG } from '@/lib/constants'
import { logger } from '@/lib/utils/logger'

// Service role client for DB operations
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase configuration')
  return createClient(url, key)
}

export interface FtpImportResult {
  success: boolean
  supplierCode: string
  supplierName: string
  totalRows: number
  newProducts: number
  updatedProducts: number
  priceChanges: number
  errors: string[]
  durationMs: number
  fileName?: string
}

/**
 * Import products from a supplier's FTP server.
 *
 * Flow:
 *   1. Load supplier from `suppliers` table by code
 *   2. Load encrypted FTP credentials
 *   3. Download + parse catalog via executeFtpSync()
 *   4. Upsert products into supplier_products
 *   5. Log price changes in price_history
 *   6. Create import_batches audit record
 */
export async function importFromFtp(
  supplierCode: 'AO' | 'LM',
  options?: { dryRun?: boolean }
): Promise<FtpImportResult> {
  const startTime = Date.now()
  const code = supplierCode.toUpperCase()
  const supabase = getServiceClient()

  try {
    // 1. Find supplier
    const { data: supplier, error: supplierErr } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle()

    if (supplierErr || !supplier) {
      return { success: false, supplierCode: code, supplierName: '', totalRows: 0, newProducts: 0, updatedProducts: 0, priceChanges: 0, errors: [`Supplier ${code} not found or inactive`], durationMs: Date.now() - startTime }
    }

    // 2. Load FTP credentials
    const { data: credRow, error: credErr } = await supabase
      .from('supplier_credentials')
      .select('credentials_encrypted, api_endpoint')
      .eq('supplier_id', supplier.id)
      .eq('credential_type', 'ftp')
      .eq('is_active', true)
      .maybeSingle()

    if (credErr || !credRow) {
      return { success: false, supplierCode: code, supplierName: supplier.name, totalRows: 0, newProducts: 0, updatedProducts: 0, priceChanges: 0, errors: ['No FTP credentials configured'], durationMs: Date.now() - startTime }
    }

    const decrypted = await decryptCredentials(credRow.credentials_encrypted) as Record<string, string>
    const ftpCreds = buildFtpCredentials(
      { username: decrypted.username, password: decrypted.password, api_endpoint: credRow.api_endpoint || undefined },
      code
    )

    // 3. Download + parse
    logger.info(`FTP import starting for ${code}`)
    const ftpResult = await executeFtpSync(ftpCreds, code)
    const rows = ftpResult.rows

    if (rows.length === 0) {
      return { success: true, supplierCode: code, supplierName: supplier.name, totalRows: 0, newProducts: 0, updatedProducts: 0, priceChanges: 0, errors: ['FTP file contained no valid rows'], durationMs: Date.now() - startTime, fileName: ftpResult.file_name }
    }

    // Dry run — return stats without writing
    if (options?.dryRun) {
      return { success: true, supplierCode: code, supplierName: supplier.name, totalRows: rows.length, newProducts: 0, updatedProducts: 0, priceChanges: 0, errors: [], durationMs: Date.now() - startTime, fileName: ftpResult.file_name }
    }

    // 4. Load existing products for upsert matching
    const { data: existingProducts } = await supabase
      .from('supplier_products')
      .select('id, supplier_sku, cost_price, list_price')
      .eq('supplier_id', supplier.id)

    const productsBySku = new Map((existingProducts || []).map((p) => [p.supplier_sku, p]))
    const now = new Date().toISOString()

    let updatedProducts = 0
    let newProducts = 0
    let priceChanges = 0
    const errors: string[] = []
    const priceHistoryBatch: Array<Record<string, unknown>> = []
    const batchSize = BATCH_CONFIG.SUPPLIER_SYNC_BATCH_SIZE

    // 5. Process in batches
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)

      try {
        const ops: Array<() => Promise<unknown>> = []

        for (const row of batch) {
          if (!row.parsed.sku || row.errors.length > 0) continue

          const existing = productsBySku.get(row.parsed.sku)

          if (existing) {
            const oldCost = existing.cost_price
            const newCost = row.parsed.cost_price

            ops.push(async () => {
              const { error } = await supabase
                .from('supplier_products')
                .update({
                  supplier_name: row.parsed.name || undefined,
                  cost_price: newCost,
                  list_price: row.parsed.list_price,
                  unit: row.parsed.unit || undefined,
                  category: row.parsed.category || undefined,
                  ean: row.parsed.ean || undefined,
                  manufacturer: row.parsed.manufacturer || undefined,
                  is_available: true,
                  last_synced_at: now,
                })
                .eq('id', existing.id)
              if (error) throw error
            })

            updatedProducts++

            if (oldCost !== null && newCost !== null && oldCost !== newCost) {
              const changePct = oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : 0
              priceHistoryBatch.push({
                supplier_product_id: existing.id,
                old_cost_price: oldCost,
                new_cost_price: newCost,
                old_list_price: existing.list_price,
                new_list_price: row.parsed.list_price,
                change_percentage: Math.round(changePct * 100) / 100,
                change_source: 'ftp_manual',
              })
              priceChanges++
            }
          } else {
            ops.push(async () => {
              const { error } = await supabase
                .from('supplier_products')
                .insert({
                  supplier_id: supplier.id,
                  supplier_sku: row.parsed.sku,
                  supplier_name: row.parsed.name || row.parsed.sku,
                  cost_price: row.parsed.cost_price || 0,
                  list_price: row.parsed.list_price,
                  unit: row.parsed.unit || 'stk',
                  category: row.parsed.category || null,
                  ean: row.parsed.ean || null,
                  manufacturer: row.parsed.manufacturer || null,
                  is_available: true,
                  last_synced_at: now,
                })
              if (error) throw error
            })
            newProducts++
          }
        }

        const results = await Promise.allSettled(ops.map((fn) => fn()))
        const failed = results.filter((r) => r.status === 'rejected')
        if (failed.length > 0) {
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${failed.length} upserts failed`)
        }
      } catch (batchErr) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${batchErr instanceof Error ? batchErr.message : 'Unknown error'}`)
      }
    }

    // 6. Insert price history
    if (priceHistoryBatch.length > 0) {
      const { error: histErr } = await supabase.from('price_history').insert(priceHistoryBatch)
      if (histErr) logger.error('Price history insert error (manual FTP)', { error: histErr })
    }

    // 7. Auto-opret prisalarm hvis prisændringer
    if (priceChanges > 0) {
      try {
        await supabase.from('system_alerts').insert({
          alert_type: 'price_increase',
          severity: priceChanges > 50 ? 'critical' : priceChanges > 10 ? 'warning' : 'info',
          title: `Prisændring: ${priceChanges} varer fra ${supplier.name}`,
          message: `FTP-import fandt ${priceChanges} prisændringer.\nNye: ${newProducts} | Opdaterede: ${updatedProducts} | Total: ${rows.length}`,
          details: {
            supplier_code: code,
            supplier_name: supplier.name,
            file_name: ftpResult.file_name,
            new_products: newProducts,
            updated_products: updatedProducts,
            price_changes: priceChanges,
          },
          entity_type: 'supplier',
          entity_id: supplier.id,
        })
      } catch (alertErr) {
        logger.warn('Could not create price alert', { error: alertErr })
      }
    }

    // 8. Create import batch audit record
    try {
      await supabase.from('import_batches').insert({
        supplier_id: supplier.id,
        file_name: ftpResult.file_name,
        file_size: ftpResult.file_size_bytes,
        total_rows: rows.length,
        imported_rows: newProducts + updatedProducts,
        skipped_rows: rows.length - (newProducts + updatedProducts),
        error_rows: errors.length,
        price_changes: priceChanges,
        status: errors.length === 0 ? 'completed' : 'partial',
      })
    } catch (auditErr) {
      logger.warn('Could not create import_batches record', { error: auditErr })
    }

    const durationMs = Date.now() - startTime
    logger.info(`FTP import completed for ${code}`, {
      metadata: { newProducts, updatedProducts, priceChanges, totalRows: rows.length, durationMs },
    })

    return {
      success: errors.length === 0,
      supplierCode: code,
      supplierName: supplier.name,
      totalRows: rows.length,
      newProducts,
      updatedProducts,
      priceChanges,
      errors,
      durationMs,
      fileName: ftpResult.file_name,
    }
  } catch (error) {
    logger.error(`FTP import failed for ${code}`, { error })
    return {
      success: false,
      supplierCode: code,
      supplierName: '',
      totalRows: 0,
      newProducts: 0,
      updatedProducts: 0,
      priceChanges: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      durationMs: Date.now() - startTime,
    }
  }
}
