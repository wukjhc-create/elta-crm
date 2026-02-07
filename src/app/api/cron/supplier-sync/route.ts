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

// Vercel cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
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

    const results: Array<{
      supplierId: string
      supplierName: string
      syncType: string
      status: 'success' | 'failed' | 'skipped'
      productsUpdated?: number
      priceChanges?: number
      error?: string
      durationMs: number
    }> = []

    // Process each schedule
    for (const schedule of schedules) {
      const syncStartTime = Date.now()
      const supplier = Array.isArray(schedule.suppliers) ? schedule.suppliers[0] : schedule.suppliers

      if (!supplier) continue

      try {
        // Update schedule to mark as running
        await supabase
          .from('supplier_sync_schedules')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: 'running',
          })
          .eq('id', schedule.id)

        // Get API client
        const client = await SupplierAPIClientFactory.getClient(schedule.supplier_id, supplier.code || '')

        if (!client) {
          results.push({
            supplierId: schedule.supplier_id,
            supplierName: supplier.name,
            syncType: schedule.sync_type,
            status: 'skipped',
            error: 'No API client available',
            durationMs: Date.now() - syncStartTime,
          })

          await supabase
            .from('supplier_sync_schedules')
            .update({
              last_run_status: 'skipped',
              last_run_duration_ms: Date.now() - syncStartTime,
            })
            .eq('id', schedule.id)

          continue
        }

        // Get products to sync
        const { data: products } = await supabase
          .from('supplier_products')
          .select('supplier_sku')
          .eq('supplier_id', schedule.supplier_id)

        const skus = products?.map((p) => p.supplier_sku) || []

        if (skus.length === 0) {
          results.push({
            supplierId: schedule.supplier_id,
            supplierName: supplier.name,
            syncType: schedule.sync_type,
            status: 'skipped',
            error: 'No products to sync',
            durationMs: Date.now() - syncStartTime,
          })

          await supabase
            .from('supplier_sync_schedules')
            .update({
              last_run_status: 'skipped',
              last_run_duration_ms: Date.now() - syncStartTime,
            })
            .eq('id', schedule.id)

          continue
        }

        // Sync prices in batches
        let updatedProducts = 0
        let priceChanges = 0
        const errors: string[] = []
        const batchSize = 50

        for (let i = 0; i < skus.length; i += batchSize) {
          // Check if we've exceeded max duration
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

            for (const [sku, price] of prices) {
              const { data: existingProduct } = await supabase
                .from('supplier_products')
                .select('id, cost_price, list_price')
                .eq('supplier_id', schedule.supplier_id)
                .eq('supplier_sku', sku)
                .single()

              if (!existingProduct) continue

              const oldPrice = existingProduct.cost_price
              const newPrice = price.costPrice

              // Update product
              await supabase
                .from('supplier_products')
                .update({
                  cost_price: newPrice,
                  list_price: price.listPrice,
                  is_available: price.isAvailable,
                  lead_time_days: price.leadTimeDays,
                  last_synced_at: new Date().toISOString(),
                })
                .eq('id', existingProduct.id)

              updatedProducts++

              // Record price change if different
              if (oldPrice !== newPrice) {
                const changePercentage =
                  oldPrice && oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0

                await supabase.from('price_history').insert({
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
          } catch (batchError) {
            errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`)
          }
        }

        const durationMs = Date.now() - syncStartTime
        const status = errors.length === 0 ? 'success' : 'partial'

        // Update schedule with results
        await supabase
          .from('supplier_sync_schedules')
          .update({
            last_run_status: status,
            last_run_duration_ms: durationMs,
            last_run_items_processed: updatedProducts,
            next_run_at: getNextRunTime(schedule.cron_expression),
          })
          .eq('id', schedule.id)

        // Create sync log
        await supabase.from('supplier_sync_logs').insert({
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
        })

        results.push({
          supplierId: schedule.supplier_id,
          supplierName: supplier.name,
          syncType: schedule.sync_type,
          status: errors.length === 0 ? 'success' : 'failed',
          productsUpdated: updatedProducts,
          priceChanges,
          error: errors.length > 0 ? errors.join('; ') : undefined,
          durationMs,
        })
      } catch (syncError) {
        const durationMs = Date.now() - syncStartTime

        // Update schedule with error
        await supabase
          .from('supplier_sync_schedules')
          .update({
            last_run_status: 'failed',
            last_run_duration_ms: durationMs,
          })
          .eq('id', schedule.id)

        // Create error log
        await supabase.from('supplier_sync_logs').insert({
          supplier_id: schedule.supplier_id,
          job_type: schedule.sync_type,
          status: 'failed',
          trigger_type: 'scheduled',
          started_at: new Date(syncStartTime).toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          error_message: syncError instanceof Error ? syncError.message : 'Unknown error',
        })

        results.push({
          supplierId: schedule.supplier_id,
          supplierName: supplier.name,
          syncType: schedule.sync_type,
          status: 'failed',
          error: syncError instanceof Error ? syncError.message : 'Unknown error',
          durationMs,
        })
      }
    }

    const totalDuration = Date.now() - startTime

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
 * Simple implementation - for production, use a proper cron parser
 */
function getNextRunTime(cronExpression: string): string {
  // Default: next day at 3 AM Copenhagen time
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(3, 0, 0, 0)
  return tomorrow.toISOString()
}
