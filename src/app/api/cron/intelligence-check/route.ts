import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { MONITORING_CONFIG } from '@/lib/constants'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

// =====================================================
// Background Intelligence Check
// Runs nightly to detect price deviations, margin
// warnings, missing materials, and calculation anomalies
// =====================================================

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  // Verify authorization - fail-secure when CRON_SECRET is not configured
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const results = {
    price_alerts: 0,
    margin_warnings: 0,
    supplier_health: 0,
    anomalies: 0,
    errors: [] as string[],
  }

  async function insertAlert(alert: Record<string, unknown>) {
    const { error } = await supabase.from('system_alerts').insert(alert)
    if (error) {
      logger.error('Failed to insert system alert', { error: error.message, metadata: alert as Record<string, unknown> })
      results.errors.push(`Alert insert failed: ${error.message}`)
    }
  }

  try {
    // =====================================================
    // 1. Price Deviation Alerts
    // Check recent price changes that exceed thresholds
    // =====================================================

    const { data: alertRules } = await supabase
      .from('price_alert_rules')
      .select('*')
      .eq('is_active', true)

    if (alertRules) {
      // Get recent price changes (last 24 hours)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const { data: priceChanges } = await supabase
        .from('price_history')
        .select(`
          *,
          supplier_product:supplier_products(
            id, supplier_name, supplier_sku, supplier_id,
            suppliers(name)
          )
        `)
        .gte('created_at', yesterday.toISOString())

      if (priceChanges) {
        for (const change of priceChanges) {
          if (!change.change_percentage) continue

          for (const rule of alertRules) {
            let shouldAlert = false
            let alertTitle = ''
            let severity: 'info' | 'warning' | 'critical' = 'warning'

            if (rule.alert_type === 'price_increase' && change.change_percentage > 0) {
              if (rule.threshold_percentage && change.change_percentage > rule.threshold_percentage) {
                shouldAlert = true
                alertTitle = `Prisstigning: ${change.supplier_product?.supplier_name || 'Ukendt'}`
                severity = change.change_percentage > MONITORING_CONFIG.PRICE_CRITICAL_CHANGE_THRESHOLD ? 'critical' : 'warning'
              }
            } else if (rule.alert_type === 'price_decrease' && change.change_percentage < 0) {
              if (rule.threshold_percentage && Math.abs(change.change_percentage) > rule.threshold_percentage) {
                shouldAlert = true
                alertTitle = `Prisfald: ${change.supplier_product?.supplier_name || 'Ukendt'}`
                severity = 'info'
              }
            }

            if (shouldAlert) {
              await insertAlert({
                alert_type: rule.alert_type,
                severity,
                title: alertTitle,
                message: `Prisændring på ${Math.abs(change.change_percentage).toFixed(1)}% for ${change.supplier_product?.supplier_name || 'ukendt produkt'} (${change.supplier_product?.supplier_sku || ''})`,
                details: {
                  supplier_product_id: change.supplier_product_id,
                  old_price: change.old_cost_price,
                  new_price: change.new_cost_price,
                  change_percentage: change.change_percentage,
                  supplier_name: change.supplier_product?.suppliers?.name,
                },
                entity_type: 'supplier_product',
                entity_id: change.supplier_product_id,
              })
              results.price_alerts++
            }
          }
        }
      }
    }

    // =====================================================
    // 2. Margin Warnings
    // Check active offers with low margins
    // =====================================================

    const { data: activeOffers } = await supabase
      .from('offers')
      .select(`
        id, title, offer_number, final_amount,
        line_items:offer_line_items(cost_price, total, supplier_product_id)
      `)
      .in('status', ['draft', 'sent'])

    if (activeOffers) {
      // Collect all supplier_product_ids across all offers to batch-load current prices
      const allSupplierProductIds = new Set<string>()
      for (const offer of activeOffers) {
        for (const li of (offer.line_items || []) as Array<{ supplier_product_id: string | null }>) {
          if (li.supplier_product_id) allSupplierProductIds.add(li.supplier_product_id)
        }
      }

      // Batch-load all supplier products at once (fixes N+1)
      const supplierProductMap = new Map<string, { cost_price: number; supplier_name: string }>()
      if (allSupplierProductIds.size > 0) {
        const { data: supplierProducts } = await supabase
          .from('supplier_products')
          .select('id, cost_price, supplier_name')
          .in('id', Array.from(allSupplierProductIds))

        for (const sp of supplierProducts || []) {
          supplierProductMap.set(sp.id, { cost_price: sp.cost_price, supplier_name: sp.supplier_name })
        }
      }

      // Batch-load existing margin alerts to avoid per-offer queries
      const offerIds = activeOffers.map(o => o.id)
      const { data: existingMarginAlerts } = await supabase
        .from('system_alerts')
        .select('entity_id')
        .eq('entity_type', 'offer')
        .eq('alert_type', 'margin_below')
        .eq('is_dismissed', false)
        .in('entity_id', offerIds)

      const offersWithMarginAlerts = new Set((existingMarginAlerts || []).map(a => a.entity_id))

      for (const offer of activeOffers) {
        const lineItems = offer.line_items || []
        const totalCost = lineItems.reduce(
          (sum: number, li: { cost_price: number | null }) => sum + (li.cost_price || 0),
          0
        )
        const totalSale = lineItems.reduce(
          (sum: number, li: { total: number }) => sum + li.total,
          0
        )

        if (totalCost > 0 && totalSale > 0) {
          const marginPct = ((totalSale - totalCost) / totalSale) * 100

          if (marginPct < MONITORING_CONFIG.MARGIN_WARNING_THRESHOLD && !offersWithMarginAlerts.has(offer.id)) {
            await insertAlert({
              alert_type: 'margin_below',
              severity: marginPct < MONITORING_CONFIG.MARGIN_CRITICAL_THRESHOLD ? 'critical' : 'warning',
              title: `Lav margin: ${offer.offer_number}`,
              message: `Tilbud "${offer.title}" har kun ${marginPct.toFixed(1)}% margin (kostpris: ${totalCost.toFixed(0)} kr, salgspris: ${totalSale.toFixed(0)} kr)`,
              details: {
                offer_number: offer.offer_number,
                total_cost: totalCost,
                total_sale: totalSale,
                margin_percentage: marginPct,
              },
              entity_type: 'offer',
              entity_id: offer.id,
            })
            results.margin_warnings++
          }
        }

        // Check if any supplier products have price changes since offer was created
        const supplierItems = lineItems.filter(
          (li: { supplier_product_id: string | null }) => li.supplier_product_id
        )
        for (const item of supplierItems) {
          if (!item.supplier_product_id) continue

          const currentProduct = supplierProductMap.get(item.supplier_product_id)
          if (currentProduct && item.cost_price) {
            const priceDiff = ((currentProduct.cost_price - item.cost_price) / item.cost_price) * 100
            if (Math.abs(priceDiff) > MONITORING_CONFIG.PRICE_CHANGE_OFFER_THRESHOLD) {
              await insertAlert({
                alert_type: priceDiff > 0 ? 'price_increase' : 'price_decrease',
                severity: 'warning',
                title: `Prisændring påvirker tilbud ${offer.offer_number}`,
                message: `${currentProduct.supplier_name}: Leverandørpris ændret ${priceDiff.toFixed(1)}% siden tilbuddets oprettelse`,
                details: {
                  offer_id: offer.id,
                  supplier_product_id: item.supplier_product_id,
                  original_cost: item.cost_price,
                  current_cost: currentProduct.cost_price,
                  change_percentage: priceDiff,
                },
                entity_type: 'offer',
                entity_id: offer.id,
              })
            }
          }
        }
      }
    }

    // =====================================================
    // 3. Supplier Health Check
    // Check sync status and product freshness
    // =====================================================

    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .eq('is_active', true)

    if (suppliers) {
      // Batch-load last sync per supplier to avoid N+1 queries
      const supplierIds = suppliers.map(s => s.id)

      const { data: allSyncLogs } = await supabase
        .from('supplier_sync_logs')
        .select('supplier_id, completed_at, status')
        .in('supplier_id', supplierIds)
        .order('completed_at', { ascending: false })

      // Build map of supplier_id → most recent sync log
      const lastSyncBySupplier = new Map<string, { completed_at: string | null; status: string }>()
      for (const log of allSyncLogs || []) {
        if (!lastSyncBySupplier.has(log.supplier_id)) {
          lastSyncBySupplier.set(log.supplier_id, log)
        }
      }

      // Batch-load product counts for suppliers without syncs
      const suppliersWithoutSync = suppliers.filter(s => !lastSyncBySupplier.has(s.id))
      const productCountBySupplier = new Map<string, number>()

      if (suppliersWithoutSync.length > 0) {
        const { data: productCounts } = await supabase
          .from('supplier_products')
          .select('supplier_id')
          .in('supplier_id', suppliersWithoutSync.map(s => s.id))

        for (const row of productCounts || []) {
          productCountBySupplier.set(row.supplier_id, (productCountBySupplier.get(row.supplier_id) || 0) + 1)
        }
      }

      // Now process all suppliers without additional queries
      for (const supplier of suppliers) {
        const lastSync = lastSyncBySupplier.get(supplier.id)

        if (lastSync) {
          const lastSyncDate = new Date(lastSync.completed_at || '')
          const daysSinceSync = (Date.now() - lastSyncDate.getTime()) / (1000 * 60 * 60 * 24)

          if (daysSinceSync > MONITORING_CONFIG.SYNC_STALE_WARNING_DAYS) {
            await insertAlert({
              alert_type: 'supplier_offline',
              severity: daysSinceSync > MONITORING_CONFIG.SYNC_STALE_CRITICAL_DAYS ? 'critical' : 'warning',
              title: `Leverandørsync forældet: ${supplier.name}`,
              message: `Sidste sync for ${supplier.name} var for ${Math.round(daysSinceSync)} dage siden. Priser kan være forældede.`,
              details: {
                supplier_id: supplier.id,
                supplier_name: supplier.name,
                last_sync_at: lastSync.completed_at,
                days_since_sync: Math.round(daysSinceSync),
              },
              entity_type: 'supplier',
              entity_id: supplier.id,
            })
            results.supplier_health++
          }

          if (lastSync.status === 'failed') {
            await insertAlert({
              alert_type: 'sync_failed' as string,
              severity: 'critical',
              title: `Sync fejl: ${supplier.name}`,
              message: `Sidste sync for ${supplier.name} fejlede. Kontroller leverandørkonfiguration.`,
              details: {
                supplier_id: supplier.id,
                supplier_name: supplier.name,
                last_status: lastSync.status,
              },
              entity_type: 'supplier',
              entity_id: supplier.id,
            })
            results.supplier_health++
          }
        } else {
          // Never synced
          if ((productCountBySupplier.get(supplier.id) || 0) === 0) {
            await insertAlert({
              alert_type: 'supplier_offline',
              severity: 'info',
              title: `Ingen produkter: ${supplier.name}`,
              message: `Leverandør ${supplier.name} har ingen produkter. Konfigurer import eller API-sync.`,
              details: {
                supplier_id: supplier.id,
                supplier_name: supplier.name,
              },
              entity_type: 'supplier',
              entity_id: supplier.id,
            })
            results.supplier_health++
          }
        }
      }
    }

    // =====================================================
    // 4. Stale Product Cache Detection
    // =====================================================

    const staleDays = MONITORING_CONFIG.STALE_PRODUCT_DAYS
    const { count: staleCount } = await supabase
      .from('supplier_products')
      .select('*', { count: 'exact', head: true })
      .lt('last_synced_at', new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString())
      .eq('is_available', true)

    if ((staleCount || 0) > MONITORING_CONFIG.STALE_PRODUCT_MIN_COUNT) {
      await insertAlert({
        alert_type: 'supplier_offline',
        severity: 'warning',
        title: `${staleCount} forældede produktpriser`,
        message: `Der er ${staleCount} aktive produkter med priser ældre end ${staleDays} dage. Overvej at køre en fuld synkronisering.`,
        details: { stale_count: staleCount },
        entity_type: 'supplier_product',
        entity_id: null,
      })
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    })
  } catch (error) {
    logger.error('Intelligence check error', { error })

    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      error: 'Internal server error',
    }, { status: 500 })
  }
}
