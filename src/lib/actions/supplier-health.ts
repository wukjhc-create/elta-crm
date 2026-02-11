'use server'

import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { SUPPLIER_API_CONFIG } from '@/lib/constants'

// =====================================================
// Types
// =====================================================

export interface SupplierHealth {
  supplierId: string
  supplierName: string
  supplierCode: string
  isOnline: boolean
  lastSuccessfulSync: string | null
  lastFailedSync: string | null
  failureCount: number
  averageResponseTime: number | null
  cacheStatus: 'fresh' | 'stale' | 'missing'
  cachedProductCount: number
}

export interface SystemHealthSummary {
  totalSuppliers: number
  onlineSuppliers: number
  offlineSuppliers: number
  freshCache: number
  staleCache: number
  missingCache: number
  lastGlobalSync: string | null
  criticalIssues: string[]
}
// =====================================================
// Health Status Functions
// =====================================================

/**
 * Get health status for a specific supplier
 */
export async function getSupplierHealth(
  supplierId: string
): Promise<ActionResult<SupplierHealth>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const maxCacheAge = SUPPLIER_API_CONFIG.CACHE_TTL_MS

    // Get supplier info
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, name, code')
      .eq('id', supplierId)
      .maybeSingle()

    if (!supplier) {
      return { success: false, error: 'Leverandør ikke fundet' }
    }

    // Get recent sync logs
    const { data: syncLogs } = await supabase
      .from('supplier_sync_logs')
      .select('status, started_at, duration_ms')
      .eq('supplier_id', supplierId)
      .order('started_at', { ascending: false })
      .limit(10)

    // Get cached product count
    const { data: products } = await supabase
      .from('supplier_products')
      .select('id')
      .eq('supplier_id', supplierId)

    const productIds = products?.map((p) => p.id) || []

    let cachedCount = 0
    let staleCount = 0

    if (productIds.length > 0) {
      const { count: freshCount } = await supabase
        .from('supplier_product_cache')
        .select('id', { count: 'exact', head: true })
        .in('supplier_product_id', productIds)
        .eq('is_stale', false)

      const { count: staleCountResult } = await supabase
        .from('supplier_product_cache')
        .select('id', { count: 'exact', head: true })
        .in('supplier_product_id', productIds)
        .eq('is_stale', true)

      cachedCount = freshCount || 0
      staleCount = staleCountResult || 0
    }

    // Calculate health metrics
    const successfulSyncs = syncLogs?.filter((l) => l.status === 'completed') || []
    const failedSyncs = syncLogs?.filter((l) => l.status === 'failed') || []

    const lastSuccessfulSync = successfulSyncs.length > 0 ? successfulSyncs[0].started_at : null
    const lastFailedSync = failedSyncs.length > 0 ? failedSyncs[0].started_at : null

    const avgResponseTime =
      successfulSyncs.length > 0
        ? successfulSyncs.reduce((sum, l) => sum + (l.duration_ms || 0), 0) / successfulSyncs.length
        : null

    // Determine if online based on recent success
    const isOnline =
      lastSuccessfulSync !== null &&
      Date.now() - new Date(lastSuccessfulSync).getTime() < maxCacheAge

    // Determine cache status
    let cacheStatus: 'fresh' | 'stale' | 'missing' = 'missing'
    if (cachedCount > 0) {
      cacheStatus = staleCount > cachedCount / 2 ? 'stale' : 'fresh'
    }

    return {
      success: true,
      data: {
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierCode: supplier.code || '',
        isOnline,
        lastSuccessfulSync,
        lastFailedSync,
        failureCount: failedSyncs.length,
        averageResponseTime: avgResponseTime ? Math.round(avgResponseTime) : null,
        cacheStatus,
        cachedProductCount: cachedCount,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente leverandørstatus') }
  }
}

/**
 * Get system-wide health summary
 */
export async function getSystemHealthSummary(): Promise<ActionResult<SystemHealthSummary>> {
  try {
    const { supabase } = await getAuthenticatedClient()
    const maxCacheAge = SUPPLIER_API_CONFIG.CACHE_TTL_MS

    // Get all active suppliers
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)

    if (!suppliers || suppliers.length === 0) {
      return {
        success: true,
        data: {
          totalSuppliers: 0,
          onlineSuppliers: 0,
          offlineSuppliers: 0,
          freshCache: 0,
          staleCache: 0,
          missingCache: 0,
          lastGlobalSync: null,
          criticalIssues: [],
        },
      }
    }

    let onlineCount = 0
    let freshCacheCount = 0
    let staleCacheCount = 0
    let missingCacheCount = 0
    const criticalIssues: string[] = []
    let lastGlobalSync: Date | null = null

    const healthResults = await Promise.allSettled(
      suppliers.map((supplier) => getSupplierHealth(supplier.id))
    )

    for (const result of healthResults) {
      if (result.status !== 'fulfilled' || !result.value.success || !result.value.data) continue
      const health = result.value.data

      if (health.isOnline) {
        onlineCount++
      } else {
        criticalIssues.push(`${health.supplierName} er offline`)
      }

      if (health.cacheStatus === 'fresh') {
        freshCacheCount++
      } else if (health.cacheStatus === 'stale') {
        staleCacheCount++
        criticalIssues.push(`${health.supplierName} har forældet cache`)
      } else {
        missingCacheCount++
      }

      if (health.failureCount >= 3) {
        criticalIssues.push(`${health.supplierName} har ${health.failureCount} fejl`)
      }

      if (health.lastSuccessfulSync) {
        const syncDate = new Date(health.lastSuccessfulSync)
        if (!lastGlobalSync || syncDate > lastGlobalSync) {
          lastGlobalSync = syncDate
        }
      }
    }

    return {
      success: true,
      data: {
        totalSuppliers: suppliers.length,
        onlineSuppliers: onlineCount,
        offlineSuppliers: suppliers.length - onlineCount,
        freshCache: freshCacheCount,
        staleCache: staleCacheCount,
        missingCache: missingCacheCount,
        lastGlobalSync: lastGlobalSync?.toISOString() || null,
        criticalIssues,
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente systemstatus') }
  }
}
