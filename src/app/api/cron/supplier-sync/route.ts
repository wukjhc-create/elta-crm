/**
 * Cron Job: Supplier Price Sync
 *
 * Runs nightly to sync product prices from all configured suppliers.
 * Triggered by Vercel Cron at 3 AM Copenhagen time.
 *
 * Configuration: vercel.json crons section
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SupplierAPIClientFactory } from '@/lib/services/supplier-api-client'
import { BATCH_CONFIG } from '@/lib/constants'

// Vercel cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
    // Verify cron secret - fail-secure when CRON_SECRET is not configured
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
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
      console.error('Error fetching schedules:', scheduleError)
      return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({
        message: 'No active sync schedules found',
        timestamp: new Date().toISOString(),
      })
    }

    type SyncResult = {
      supplierId: string
      supplierName: string
      syncType: string
      status: 'success' | 'failed' | 'skipped'
      productsUpdated?: number
      priceChanges?: number
      error?: string
      durationMs: number
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
                if (historyError) console.error('Price history insert error:', historyError)
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

    console.info(`[Cron] Supplier sync completed in ${totalDuration}ms: ${succeeded} success, ${failed} failed, ${skipped} skipped`)

    return NextResponse.json({
      message: 'Sync completed',
      timestamp: new Date().toISOString(),
      totalDurationMs: totalDuration,
      schedulesProcessed: schedules.length,
      results,
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
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
