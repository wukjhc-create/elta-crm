/**
 * Cron Job: Supplier Price Sync
 *
 * Runs nightly to sync product prices from all configured suppliers.
 * Triggered by Vercel Cron at 3 AM Copenhagen time.
 *
 * Configuration: vercel.json crons section
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { SupplierAPIClientFactory } from '@/lib/services/supplier-api-client'
import { executeFtpSync, buildFtpCredentials } from '@/lib/services/supplier-ftp-sync'
import { decryptCredentials } from '@/lib/utils/encryption'
import { BATCH_CONFIG } from '@/lib/constants'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

// Vercel cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
    // Verify cron secret - fail-secure when CRON_SECRET is not configured
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
    const supabase = await createClient()

    // Get all active sync schedules that are due
    const { data: schedules, error: scheduleError } = await supabase
      .from('supplier_sync_schedules')
      .select(`
        id,
        supplier_id,
        sync_type,
        schedule_name,
        cron_expression,
        max_duration_minutes,
        retry_on_failure,
        max_retries,
        suppliers!inner (
          id,
          name,
          code,
          is_active
        )
      `)
      .eq('is_enabled', true)
      .eq('suppliers.is_active', true)

    if (scheduleError) {
      logger.error('Error fetching schedules', { error: scheduleError })
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({
        message: 'No active sync schedules found',
        timestamp: new Date().toISOString(),
      })
    }

    // Process all schedules in parallel
    const syncResults = await Promise.allSettled(
      schedules.map(async (schedule): Promise<SyncResult> => {
        const syncStartTime = Date.now()
        const supplier = Array.isArray(schedule.suppliers) ? schedule.suppliers[0] : schedule.suppliers

        if (!supplier) {
          return { supplierId: schedule.supplier_id, supplierName: '?', syncType: schedule.sync_type, status: 'skipped', error: 'No supplier', durationMs: 0 }
        }

        try {
          // Mark as running
          await supabase
            .from('supplier_sync_schedules')
            .update({ last_run_at: new Date().toISOString(), last_run_status: 'running' })
            .eq('id', schedule.id)

          // Branch by sync type
          if (schedule.sync_type === 'ftp') {
            // =============== FTP SYNC ===============
            return await executeFtpSyncSchedule(supabase, schedule, supplier, syncStartTime)
          }

          // =============== API SYNC (default) ===============

          // Get API client
          const client = await SupplierAPIClientFactory.getClient(schedule.supplier_id, supplier.code || '')

          if (!client) {
            const durationMs = Date.now() - syncStartTime
            await supabase.from('supplier_sync_schedules').update({ last_run_status: 'skipped', last_run_duration_ms: durationMs }).eq('id', schedule.id)
            return { supplierId: schedule.supplier_id, supplierName: supplier.name, syncType: schedule.sync_type, status: 'skipped', error: 'No API client available', durationMs }
          }

          // Get products to sync - load all at once to avoid N+1 queries
          const { data: products } = await supabase
            .from('supplier_products')
            .select('id, supplier_sku, cost_price, list_price')
            .eq('supplier_id', schedule.supplier_id)

          const skus = products?.map((p) => p.supplier_sku) || []
          const productsBySkU = new Map((products || []).map((p) => [p.supplier_sku, p]))

          if (skus.length === 0) {
            const durationMs = Date.now() - syncStartTime
            await supabase.from('supplier_sync_schedules').update({ last_run_status: 'skipped', last_run_duration_ms: durationMs }).eq('id', schedule.id)
            return { supplierId: schedule.supplier_id, supplierName: supplier.name, syncType: schedule.sync_type, status: 'skipped', error: 'No products to sync', durationMs }
          }

          // Sync prices in batches
          let updatedProducts = 0
          let priceChanges = 0
          const errors: string[] = []
          const batchSize = BATCH_CONFIG.SUPPLIER_SYNC_BATCH_SIZE

          for (let i = 0; i < skus.length; i += batchSize) {
            // Check max duration
            if (schedule.max_duration_minutes) {
              const elapsedMinutes = (Date.now() - syncStartTime) / 60000
              if (elapsedMinutes >= schedule.max_duration_minutes) {
                errors.push(`Sync stopped: exceeded max duration of ${schedule.max_duration_minutes} minutes`)
                break
              }
            }

            const batch = skus.slice(i, i + batchSize)

            try {
              const prices = await client.getProductPrices(batch)
              const now = new Date().toISOString()
              const priceHistoryBatch: Array<Record<string, unknown>> = []
              const updateFns: Array<() => Promise<unknown>> = []

              for (const [sku, price] of prices) {
                const existingProduct = productsBySkU.get(sku)
                if (!existingProduct) continue

                const oldPrice = existingProduct.cost_price
                const newPrice = price.costPrice
                const productId = existingProduct.id

                updateFns.push(async () => {
                  const { error } = await supabase
                    .from('supplier_products')
                    .update({
                      cost_price: newPrice,
                      list_price: price.listPrice,
                      is_available: price.isAvailable,
                      lead_time_days: price.leadTimeDays,
                      last_synced_at: now,
                    })
                    .eq('id', productId)
                  if (error) throw error
                })

                updatedProducts++

                if (oldPrice !== newPrice) {
                  const changePercentage = oldPrice && oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0
                  priceHistoryBatch.push({
                    supplier_product_id: existingProduct.id,
                    old_cost_price: oldPrice,
                    new_cost_price: newPrice,
                    old_list_price: existingProduct.list_price,
                    new_list_price: price.listPrice,
                    change_percentage: Math.round(changePercentage * 100) / 100,
                    change_source: 'api_sync',
                  })
                  priceChanges++
                }
              }

              // Execute all product updates in parallel
              const updateResults = await Promise.allSettled(updateFns.map((fn) => fn()))
              const failedUpdates = updateResults.filter((r) => r.status === 'rejected')
              if (failedUpdates.length > 0) {
                errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${failedUpdates.length} product updates failed`)
              }

              // Batch insert price history records
              if (priceHistoryBatch.length > 0) {
                const { error: historyError } = await supabase.from('price_history').insert(priceHistoryBatch)
                if (historyError) logger.error('Price history insert error', { error: historyError })
              }
            } catch (batchError) {
              errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`)
            }
          }

          const durationMs = Date.now() - syncStartTime
          const status = errors.length === 0 ? 'success' : 'partial'

          // Update schedule and create sync log in parallel
          await Promise.all([
            supabase.from('supplier_sync_schedules').update({
              last_run_status: status,
              last_run_duration_ms: durationMs,
              last_run_items_processed: updatedProducts,
              next_run_at: getNextRunTime(schedule.cron_expression),
            }).eq('id', schedule.id),
            supabase.from('supplier_sync_logs').insert({
              supplier_id: schedule.supplier_id,
              sync_job_id: null,
              job_type: schedule.sync_type,
              status: status === 'success' ? 'completed' : 'partial',
              trigger_type: 'scheduled',
              started_at: new Date(syncStartTime).toISOString(),
              completed_at: new Date().toISOString(),
              duration_ms: durationMs,
              total_items: skus.length,
              processed_items: updatedProducts,
              updated_items: updatedProducts,
              price_changes_count: priceChanges,
              error_message: errors.length > 0 ? errors.join('; ') : null,
            }),
          ])

          return {
            supplierId: schedule.supplier_id,
            supplierName: supplier.name,
            syncType: schedule.sync_type,
            status: errors.length === 0 ? 'success' : 'failed',
            productsUpdated: updatedProducts,
            priceChanges,
            error: errors.length > 0 ? errors.join('; ') : undefined,
            durationMs,
          }
        } catch (syncError) {
          const durationMs = Date.now() - syncStartTime

          // Update schedule and create error log in parallel
          await Promise.all([
            supabase.from('supplier_sync_schedules').update({ last_run_status: 'failed', last_run_duration_ms: durationMs }).eq('id', schedule.id),
            supabase.from('supplier_sync_logs').insert({
              supplier_id: schedule.supplier_id,
              job_type: schedule.sync_type,
              status: 'failed',
              trigger_type: 'scheduled',
              started_at: new Date(syncStartTime).toISOString(),
              completed_at: new Date().toISOString(),
              duration_ms: durationMs,
              error_message: syncError instanceof Error ? syncError.message : 'Unknown error',
            }),
          ])

          return {
            supplierId: schedule.supplier_id,
            supplierName: supplier.name,
            syncType: schedule.sync_type,
            status: 'failed',
            error: syncError instanceof Error ? syncError.message : 'Unknown error',
            durationMs,
          }
        }
      })
    )

    const results = syncResults
      .filter((r): r is PromiseFulfilledResult<SyncResult> => r.status === 'fulfilled')
      .map((r) => r.value)

    const totalDuration = Date.now() - startTime
    const succeeded = results.filter(r => r.status === 'success').length
    const failed = results.filter(r => r.status === 'failed').length
    const skipped = results.filter(r => r.status === 'skipped').length

    logger.info(`Cron supplier sync completed`, { duration: totalDuration, metadata: { succeeded, failed, skipped } })

    return NextResponse.json({
      message: 'Sync completed',
      timestamp: new Date().toISOString(),
      totalDurationMs: totalDuration,
      schedulesProcessed: schedules.length,
      results,
    })
  } catch (error) {
    logger.error('Cron job error', { error })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// =====================================================
// FTP Sync Handler
// =====================================================

type ScheduleRecord = {
  id: string
  supplier_id: string
  sync_type: string
  cron_expression: string
  max_duration_minutes: number | null
  retry_on_failure: boolean
  max_retries: number | null
}

type SupplierRecord = {
  id: string
  name: string
  code: string | null
  is_active: boolean
}

type SyncResult = {
  supplierId: string
  supplierName: string
  syncType: string
  status: 'success' | 'failed' | 'skipped'
  productsUpdated?: number
  priceChanges?: number
  newProducts?: number
  error?: string
  durationMs: number
}

/**
 * Execute FTP-based sync for a supplier schedule.
 * Downloads catalog CSV from FTP, parses it, and upserts products.
 */
async function executeFtpSyncSchedule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schedule: ScheduleRecord,
  supplier: SupplierRecord,
  syncStartTime: number
): Promise<SyncResult> {
  const supplierCode = supplier.code?.toUpperCase() || ''

  // Get FTP credentials from database
  const { data: credRow, error: credError } = await supabase
    .from('supplier_credentials')
    .select('credentials_encrypted, api_endpoint')
    .eq('supplier_id', schedule.supplier_id)
    .eq('credential_type', 'ftp')
    .eq('is_active', true)
    .maybeSingle()

  if (credError || !credRow) {
    const durationMs = Date.now() - syncStartTime
    await supabase.from('supplier_sync_schedules').update({ last_run_status: 'skipped', last_run_duration_ms: durationMs }).eq('id', schedule.id)
    return { supplierId: schedule.supplier_id, supplierName: supplier.name, syncType: 'ftp', status: 'skipped', error: 'No FTP credentials configured', durationMs }
  }

  // Decrypt and build FTP credentials
  const decrypted = await decryptCredentials(credRow.credentials_encrypted) as Record<string, string>
  const ftpCreds = buildFtpCredentials(
    { username: decrypted.username, password: decrypted.password, api_endpoint: credRow.api_endpoint || undefined },
    supplierCode
  )

  // Execute FTP download + parse
  const ftpResult = await executeFtpSync(ftpCreds, supplierCode)
  const rows = ftpResult.rows

  if (rows.length === 0) {
    const durationMs = Date.now() - syncStartTime
    await supabase.from('supplier_sync_schedules').update({ last_run_status: 'skipped', last_run_duration_ms: durationMs }).eq('id', schedule.id)
    return { supplierId: schedule.supplier_id, supplierName: supplier.name, syncType: 'ftp', status: 'skipped', error: 'FTP file contained no valid rows', durationMs }
  }

  // Load existing products for this supplier (for upsert matching)
  const { data: existingProducts } = await supabase
    .from('supplier_products')
    .select('id, supplier_sku, cost_price, list_price')
    .eq('supplier_id', schedule.supplier_id)

  const productsBySku = new Map((existingProducts || []).map((p) => [p.supplier_sku, p]))
  const now = new Date().toISOString()

  let updatedProducts = 0
  let newProducts = 0
  let priceChanges = 0
  const errors: string[] = []
  const priceHistoryBatch: Array<Record<string, unknown>> = []
  const batchSize = BATCH_CONFIG.SUPPLIER_SYNC_BATCH_SIZE

  // Process parsed rows in batches
  for (let i = 0; i < rows.length; i += batchSize) {
    // Check max duration
    if (schedule.max_duration_minutes) {
      const elapsedMinutes = (Date.now() - syncStartTime) / 60000
      if (elapsedMinutes >= schedule.max_duration_minutes) {
        errors.push(`Sync stopped: exceeded max duration of ${schedule.max_duration_minutes} minutes`)
        break
      }
    }

    const batch = rows.slice(i, i + batchSize)

    try {
      const updateFns: Array<() => Promise<unknown>> = []

      for (const row of batch) {
        if (!row.parsed.sku || row.errors.length > 0) continue

        const existing = productsBySku.get(row.parsed.sku)

        if (existing) {
          // Update existing product
          const oldCost = existing.cost_price
          const newCost = row.parsed.cost_price

          updateFns.push(async () => {
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

          // Track price change
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
        } else {
          // Insert new product
          updateFns.push(async () => {
            const { error } = await supabase
              .from('supplier_products')
              .insert({
                supplier_id: schedule.supplier_id,
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

      // Execute batch updates/inserts in parallel
      const updateResults = await Promise.allSettled(updateFns.map((fn) => fn()))
      const failedUpdates = updateResults.filter((r) => r.status === 'rejected')
      if (failedUpdates.length > 0) {
        errors.push(`FTP batch ${Math.floor(i / batchSize) + 1}: ${failedUpdates.length} upserts failed`)
      }
    } catch (batchError) {
      errors.push(`FTP batch ${Math.floor(i / batchSize) + 1}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`)
    }
  }

  // Batch insert price history records
  if (priceHistoryBatch.length > 0) {
    const { error: historyError } = await supabase.from('price_history').insert(priceHistoryBatch)
    if (historyError) logger.error('Price history insert error (FTP)', { error: historyError })
  }

  const durationMs = Date.now() - syncStartTime
  const status = errors.length === 0 ? 'success' : 'partial'

  // Update schedule and create sync log
  await Promise.all([
    supabase.from('supplier_sync_schedules').update({
      last_run_status: status,
      last_run_duration_ms: durationMs,
      last_run_items_processed: updatedProducts + newProducts,
      next_run_at: getNextRunTime(schedule.cron_expression),
    }).eq('id', schedule.id),
    supabase.from('supplier_sync_logs').insert({
      supplier_id: schedule.supplier_id,
      sync_job_id: null,
      job_type: 'ftp',
      status: status === 'success' ? 'completed' : 'partial',
      trigger_type: 'scheduled',
      started_at: new Date(syncStartTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      total_items: rows.length,
      processed_items: updatedProducts + newProducts,
      new_items: newProducts,
      updated_items: updatedProducts,
      price_changes_count: priceChanges,
      error_message: errors.length > 0 ? errors.join('; ') : null,
    }),
  ])

  return {
    supplierId: schedule.supplier_id,
    supplierName: supplier.name,
    syncType: 'ftp',
    status: errors.length === 0 ? 'success' : 'failed',
    productsUpdated: updatedProducts,
    newProducts,
    priceChanges,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    durationMs,
  }
}

/**
 * Calculate next run time based on cron expression
 * Parses hour from cron format "minute hour * * *" (standard 5-field cron)
 * Falls back to tomorrow 3 AM if parsing fails
 */
function getNextRunTime(cronExpression: string): string {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  try {
    // Parse cron: "min hour day month weekday"
    const parts = cronExpression.trim().split(/\s+/)
    if (parts.length >= 2) {
      const minute = parseInt(parts[0])
      const hour = parseInt(parts[1])
      if (!isNaN(minute) && !isNaN(hour)) {
        tomorrow.setHours(hour, minute, 0, 0)
        return tomorrow.toISOString()
      }
    }
  } catch {
    // Fall through to default
  }

  // Default: 3 AM
  tomorrow.setHours(3, 0, 0, 0)
  return tomorrow.toISOString()
}
