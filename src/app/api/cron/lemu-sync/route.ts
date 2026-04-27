/**
 * Cron Job: Lemvigh-Müller Weekly Price Sync
 *
 * Connects to LEMU SFTP (port 22), downloads the latest CSV price file
 * from /FromLEMU/pricat/, and upserts products into supplier_products.
 *
 * Schedule: Weekly on Monday at 4 AM UTC (5 AM Copenhagen)
 * Config: vercel.json crons section
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeFtpSync, buildFtpCredentials } from '@/lib/services/supplier-ftp-sync'
import { decryptCredentials } from '@/lib/utils/encryption'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

const CRON_SECRET = process.env.CRON_SECRET
const UPSERT_BATCH_SIZE = 1000 // Supabase bulk upsert batch size

export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const expected = `Bearer ${CRON_SECRET}`
    if (
      !CRON_SECRET ||
      !authHeader ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const startTime = Date.now()
    const supabase = createAdminClient()

    // Find LM supplier
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .ilike('code', 'LM')
      .eq('is_active', true)
      .maybeSingle()

    if (!supplier) {
      return NextResponse.json({
        message: 'Lemvigh-Müller supplier not found or inactive',
        timestamp: new Date().toISOString(),
      })
    }

    // Get SFTP credentials
    const { data: credRow, error: credError } = await supabase
      .from('supplier_credentials')
      .select('credentials_encrypted, api_endpoint')
      .eq('supplier_id', supplier.id)
      .eq('credential_type', 'ftp')
      .eq('is_active', true)
      .maybeSingle()

    if (credError || !credRow) {
      logger.warn('LEMU cron: No SFTP credentials configured')
      return NextResponse.json({
        message: 'No SFTP credentials configured for Lemvigh-Müller',
        timestamp: new Date().toISOString(),
      })
    }

    // Decrypt and build credentials
    const decrypted = await decryptCredentials(credRow.credentials_encrypted) as Record<string, string>
    const creds = buildFtpCredentials(
      { username: decrypted.username, password: decrypted.password, api_endpoint: credRow.api_endpoint || undefined, host: decrypted.host },
      'LM'
    )

    // Execute SFTP sync (download + parse)
    const ftpResult = await executeFtpSync(creds, 'LM')

    // Filter valid rows and deduplicate by SKU (keep last occurrence)
    const rowsBySku = new Map<string, typeof ftpResult.rows[0]>()
    for (const row of ftpResult.rows) {
      if (row.parsed.sku && row.errors.length === 0) {
        rowsBySku.set(row.parsed.sku, row)
      }
    }
    const validRows = Array.from(rowsBySku.values())

    const totalParsed = ftpResult.rows.length
    const deduplicatedCount = validRows.length

    if (validRows.length === 0) {
      await supabase.from('supplier_sync_logs').insert({
        supplier_id: supplier.id,
        job_type: 'ftp',
        status: 'completed',
        trigger_type: 'scheduled',
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        total_items: ftpResult.rows.length,
        processed_items: 0,
        details: { file_name: ftpResult.file_name, total_parsed: totalParsed, note: 'No valid rows after parsing' },
      })
      return NextResponse.json({ message: 'No valid rows in CSV', file: ftpResult.file_name })
    }

    // Load existing products for price change tracking
    const { data: existingProducts } = await supabase
      .from('supplier_products')
      .select('id, supplier_sku, cost_price, list_price')
      .eq('supplier_id', supplier.id)

    const productsBySku = new Map((existingProducts || []).map((p) => [p.supplier_sku, p]))
    const now = new Date().toISOString()

    let newProducts = 0
    let updatedProducts = 0
    let priceChanges = 0
    const errors: string[] = []
    const priceHistoryBatch: Array<Record<string, unknown>> = []

    // Separate new products from updates
    const newRecords: Array<Record<string, unknown>> = []
    const updateRecords: Array<Record<string, unknown>> = []

    for (const row of validRows) {
      const existing = productsBySku.get(row.parsed.sku)
      const category = row.parsed.category || 'Lemu Import'

      if (existing) {
        updatedProducts++
        // Track price changes
        const oldCost = existing.cost_price
        const newCost = row.parsed.cost_price
        if (oldCost !== null && newCost !== null && oldCost !== newCost) {
          const changePct = oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : 0
          priceHistoryBatch.push({
            supplier_product_id: existing.id,
            old_cost_price: oldCost,
            new_cost_price: newCost,
            old_list_price: existing.list_price,
            new_list_price: row.parsed.list_price,
            change_percentage: Math.round(changePct * 100) / 100,
            change_source: 'ftp_sync',
          })
          priceChanges++
        }

        updateRecords.push({
          supplier_id: supplier.id,
          supplier_sku: row.parsed.sku,
          supplier_name: row.parsed.name || row.parsed.sku,
          cost_price: row.parsed.cost_price ?? 0,
          list_price: row.parsed.list_price,
          unit: row.parsed.unit || 'stk',
          category,
          sub_category: row.parsed.sub_category || null,
          ean: row.parsed.ean || null,
          manufacturer: row.parsed.manufacturer || null,
          is_available: true,
          last_synced_at: now,
        })
      } else {
        newProducts++
        newRecords.push({
          supplier_id: supplier.id,
          supplier_sku: row.parsed.sku,
          supplier_name: row.parsed.name || row.parsed.sku,
          cost_price: row.parsed.cost_price ?? 0,
          list_price: row.parsed.list_price,
          unit: row.parsed.unit || 'stk',
          category,
          sub_category: row.parsed.sub_category || null,
          ean: row.parsed.ean || null,
          manufacturer: row.parsed.manufacturer || null,
          is_available: true,
          status: 'pending',
          data_source: 'import',
          last_synced_at: now,
        })
      }
    }

    // Bulk UPSERT new products
    for (let i = 0; i < newRecords.length; i += UPSERT_BATCH_SIZE) {
      const batch = newRecords.slice(i, i + UPSERT_BATCH_SIZE)
      const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1
      try {
        const { error: insertErr } = await supabase
          .from('supplier_products')
          .upsert(batch, {
            onConflict: 'supplier_id,supplier_sku',
            ignoreDuplicates: false,
          })
        if (insertErr) {
          errors.push(`New batch ${batchNum}: ${insertErr.message}`)
          logger.warn(`LEMU new batch ${batchNum} error`, { error: insertErr })
        }
      } catch (batchError) {
        errors.push(`New batch ${batchNum}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`)
      }
    }

    // Bulk UPSERT existing products (preserves status/data_source)
    for (let i = 0; i < updateRecords.length; i += UPSERT_BATCH_SIZE) {
      const batch = updateRecords.slice(i, i + UPSERT_BATCH_SIZE)
      const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1
      try {
        const { error: upsertErr } = await supabase
          .from('supplier_products')
          .upsert(batch, {
            onConflict: 'supplier_id,supplier_sku',
            ignoreDuplicates: false,
          })
        if (upsertErr) {
          errors.push(`Update batch ${batchNum}: ${upsertErr.message}`)
          logger.warn(`LEMU update batch ${batchNum} error`, { error: upsertErr })
        }
      } catch (batchError) {
        errors.push(`Update batch ${batchNum}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`)
      }
    }

    // Insert price history in batches
    if (priceHistoryBatch.length > 0) {
      for (let i = 0; i < priceHistoryBatch.length; i += UPSERT_BATCH_SIZE) {
        const batch = priceHistoryBatch.slice(i, i + UPSERT_BATCH_SIZE)
        const { error: histErr } = await supabase.from('price_history').insert(batch)
        if (histErr) logger.error('Price history insert error (LEMU cron)', { error: histErr })
      }
    }

    const durationMs = Date.now() - startTime
    const status = errors.length === 0 ? 'success' : 'partial'

    // Update schedule + create log
    await Promise.all([
      supabase.from('supplier_sync_schedules')
        .update({
          last_run_at: now,
          last_run_status: status,
          last_run_duration_ms: durationMs,
          last_run_items_processed: updatedProducts + newProducts,
        })
        .eq('supplier_id', supplier.id),
      supabase.from('supplier_sync_logs').insert({
        supplier_id: supplier.id,
        job_type: 'ftp',
        status: status === 'success' ? 'completed' : 'partial',
        trigger_type: 'scheduled',
        started_at: new Date(startTime).toISOString(),
        completed_at: now,
        duration_ms: durationMs,
        total_items: deduplicatedCount,
        processed_items: updatedProducts + newProducts,
        new_items: newProducts,
        updated_items: updatedProducts,
        price_changes_count: priceChanges,
        error_message: errors.length > 0 ? errors.join('; ') : null,
        details: { file_name: ftpResult.file_name, file_size: ftpResult.file_size_bytes, total_parsed: totalParsed, deduplicated: deduplicatedCount },
      }),
    ])

    logger.info('LEMU cron sync completed', {
      duration: durationMs,
      metadata: { updated: updatedProducts, new: newProducts, priceChanges, file: ftpResult.file_name },
    })

    return NextResponse.json({
      message: 'LEMU sync completed',
      timestamp: now,
      durationMs,
      file: ftpResult.file_name,
      updated: updatedProducts,
      new: newProducts,
      priceChanges,
      totalParsed,
      deduplicated: deduplicatedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    logger.error('LEMU cron job error', { error: error instanceof Error ? error : new Error(String(error)) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
