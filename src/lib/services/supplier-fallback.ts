/**
 * Supplier Fallback Service
 *
 * Provides robust fallback mechanisms when supplier APIs are unavailable:
 * - Cached price retrieval
 * - Stale price detection
 * - Fallback priority management
 * - Health status tracking
 */

import { createClient } from '@/lib/supabase/server'

// =====================================================
// Types
// =====================================================

export interface CachedPrice {
  supplierProductId: string
  costPrice: number
  listPrice: number | null
  isAvailable: boolean
  stockQuantity: number | null
  leadTimeDays: number | null
  cachedAt: Date
  cacheSource: 'api' | 'import' | 'manual'
  isStale: boolean
  fallbackPriority: number
}

export interface SupplierHealth {
  supplierId: string
  supplierName: string
  supplierCode: string
  isOnline: boolean
  lastSuccessfulSync: Date | null
  lastFailedSync: Date | null
  failureCount: number
  averageResponseTime: number | null
  cacheStatus: 'fresh' | 'stale' | 'missing'
  cachedProductCount: number
}

export interface FallbackResult<T> {
  data: T
  source: 'api' | 'cache' | 'database' | 'manual'
  isStale: boolean
  cachedAt: Date | null
  warning?: string
}

// =====================================================
// Fallback Service Class
// =====================================================

export class SupplierFallbackService {
  private supplierId: string
  private maxCacheAge: number // milliseconds

  constructor(supplierId: string, options?: { maxCacheAgeHours?: number }) {
    this.supplierId = supplierId
    this.maxCacheAge = (options?.maxCacheAgeHours || 24) * 60 * 60 * 1000
  }

  /**
   * Get cached price for a product
   */
  async getCachedPrice(supplierProductId: string): Promise<CachedPrice | null> {
    try {
      const supabase = await createClient()

      // First try the dedicated cache table
      const { data: cache } = await supabase
        .from('supplier_product_cache')
        .select('*')
        .eq('supplier_product_id', supplierProductId)
        .single()

      if (cache) {
        const cachedAt = new Date(cache.cached_at)
        const isStale = cache.is_stale || this.isPriceStale(cachedAt)

        return {
          supplierProductId: cache.supplier_product_id,
          costPrice: cache.cached_cost_price,
          listPrice: cache.cached_list_price,
          isAvailable: cache.cached_is_available ?? true,
          stockQuantity: cache.cached_stock_quantity,
          leadTimeDays: cache.cached_lead_time_days,
          cachedAt,
          cacheSource: cache.cache_source || 'api',
          isStale,
          fallbackPriority: cache.fallback_priority || 0,
        }
      }

      // Fallback to the main supplier_products table
      const { data: product } = await supabase
        .from('supplier_products')
        .select('id, cost_price, list_price, is_available, lead_time_days, last_synced_at')
        .eq('id', supplierProductId)
        .single()

      if (product && product.cost_price) {
        const cachedAt = product.last_synced_at ? new Date(product.last_synced_at) : new Date(0)
        const isStale = this.isPriceStale(cachedAt)

        return {
          supplierProductId: product.id,
          costPrice: product.cost_price,
          listPrice: product.list_price,
          isAvailable: product.is_available ?? true,
          stockQuantity: null,
          leadTimeDays: product.lead_time_days,
          cachedAt,
          cacheSource: 'import',
          isStale,
          fallbackPriority: 0,
        }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Get cached prices for multiple products
   */
  async getCachedPrices(supplierProductIds: string[]): Promise<Map<string, CachedPrice>> {
    const result = new Map<string, CachedPrice>()

    try {
      const supabase = await createClient()

      // Try cache table first
      const { data: cacheData } = await supabase
        .from('supplier_product_cache')
        .select('*')
        .in('supplier_product_id', supplierProductIds)

      for (const cache of cacheData || []) {
        const cachedAt = new Date(cache.cached_at)
        const isStale = cache.is_stale || this.isPriceStale(cachedAt)

        result.set(cache.supplier_product_id, {
          supplierProductId: cache.supplier_product_id,
          costPrice: cache.cached_cost_price,
          listPrice: cache.cached_list_price,
          isAvailable: cache.cached_is_available ?? true,
          stockQuantity: cache.cached_stock_quantity,
          leadTimeDays: cache.cached_lead_time_days,
          cachedAt,
          cacheSource: cache.cache_source || 'api',
          isStale,
          fallbackPriority: cache.fallback_priority || 0,
        })
      }

      // Get remaining from supplier_products
      const missingIds = supplierProductIds.filter((id) => !result.has(id))
      if (missingIds.length > 0) {
        const { data: products } = await supabase
          .from('supplier_products')
          .select('id, cost_price, list_price, is_available, lead_time_days, last_synced_at')
          .in('id', missingIds)
          .not('cost_price', 'is', null)

        for (const product of products || []) {
          const cachedAt = product.last_synced_at ? new Date(product.last_synced_at) : new Date(0)
          const isStale = this.isPriceStale(cachedAt)

          result.set(product.id, {
            supplierProductId: product.id,
            costPrice: product.cost_price!,
            listPrice: product.list_price,
            isAvailable: product.is_available ?? true,
            stockQuantity: null,
            leadTimeDays: product.lead_time_days,
            cachedAt,
            cacheSource: 'import',
            isStale,
            fallbackPriority: 0,
          })
        }
      }
    } catch {
      // Return whatever we have
    }

    return result
  }

  /**
   * Update cache with fresh data
   */
  async updateCache(
    supplierProductId: string,
    data: {
      costPrice: number
      listPrice?: number | null
      isAvailable?: boolean
      stockQuantity?: number | null
      leadTimeDays?: number | null
    },
    source: 'api' | 'import' | 'manual' = 'api'
  ): Promise<void> {
    try {
      const supabase = await createClient()
      const now = new Date()
      const expiresAt = new Date(now.getTime() + this.maxCacheAge)

      await supabase.from('supplier_product_cache').upsert(
        {
          supplier_product_id: supplierProductId,
          cached_cost_price: data.costPrice,
          cached_list_price: data.listPrice ?? null,
          cached_is_available: data.isAvailable ?? true,
          cached_stock_quantity: data.stockQuantity ?? null,
          cached_lead_time_days: data.leadTimeDays ?? null,
          cached_at: now.toISOString(),
          cache_source: source,
          cache_expires_at: expiresAt.toISOString(),
          is_stale: false,
          fallback_priority: source === 'api' ? 2 : source === 'import' ? 1 : 0,
        },
        { onConflict: 'supplier_product_id' }
      )
    } catch {
      // Ignore cache update errors
    }
  }

  /**
   * Mark cache entries as stale
   */
  async markCacheStale(supplierProductIds?: string[]): Promise<void> {
    try {
      const supabase = await createClient()

      let query = supabase.from('supplier_product_cache').update({ is_stale: true })

      if (supplierProductIds) {
        query = query.in('supplier_product_id', supplierProductIds)
      } else {
        // Mark all for this supplier
        const { data: products } = await supabase
          .from('supplier_products')
          .select('id')
          .eq('supplier_id', this.supplierId)

        if (products) {
          query = query.in(
            'supplier_product_id',
            products.map((p) => p.id)
          )
        }
      }

      await query
    } catch {
      // Ignore errors
    }
  }

  /**
   * Get supplier health status
   */
  async getHealthStatus(): Promise<SupplierHealth | null> {
    try {
      const supabase = await createClient()

      // Get supplier info
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('id, name, code')
        .eq('id', this.supplierId)
        .single()

      if (!supplier) return null

      // Get recent sync logs
      const { data: syncLogs } = await supabase
        .from('supplier_sync_logs')
        .select('status, started_at, duration_ms')
        .eq('supplier_id', this.supplierId)
        .order('started_at', { ascending: false })
        .limit(10)

      // Get cached product count
      const { data: products } = await supabase
        .from('supplier_products')
        .select('id')
        .eq('supplier_id', this.supplierId)

      const productIds = products?.map((p) => p.id) || []

      const { count: cachedCount } = await supabase
        .from('supplier_product_cache')
        .select('id', { count: 'exact', head: true })
        .in('supplier_product_id', productIds)
        .eq('is_stale', false)

      const { count: staleCount } = await supabase
        .from('supplier_product_cache')
        .select('id', { count: 'exact', head: true })
        .in('supplier_product_id', productIds)
        .eq('is_stale', true)

      // Calculate health metrics
      const successfulSyncs = syncLogs?.filter((l) => l.status === 'completed') || []
      const failedSyncs = syncLogs?.filter((l) => l.status === 'failed') || []

      const lastSuccessfulSync = successfulSyncs.length > 0 ? new Date(successfulSyncs[0].started_at) : null

      const lastFailedSync = failedSyncs.length > 0 ? new Date(failedSyncs[0].started_at) : null

      const avgResponseTime =
        successfulSyncs.length > 0
          ? successfulSyncs.reduce((sum, l) => sum + (l.duration_ms || 0), 0) / successfulSyncs.length
          : null

      // Determine if online based on recent success
      const isOnline =
        lastSuccessfulSync !== null &&
        Date.now() - lastSuccessfulSync.getTime() < 24 * 60 * 60 * 1000

      // Determine cache status
      let cacheStatus: 'fresh' | 'stale' | 'missing' = 'missing'
      if ((cachedCount || 0) > 0) {
        cacheStatus = (staleCount || 0) > (cachedCount || 0) / 2 ? 'stale' : 'fresh'
      }

      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierCode: supplier.code || '',
        isOnline,
        lastSuccessfulSync,
        lastFailedSync,
        failureCount: failedSyncs.length,
        averageResponseTime: avgResponseTime ? Math.round(avgResponseTime) : null,
        cacheStatus,
        cachedProductCount: cachedCount || 0,
      }
    } catch {
      return null
    }
  }

  /**
   * Check if a cached price is stale
   */
  private isPriceStale(cachedAt: Date): boolean {
    return Date.now() - cachedAt.getTime() > this.maxCacheAge
  }
}

// =====================================================
// Standalone Functions
// =====================================================

/**
 * Get health status for all suppliers
 */
export async function getAllSupplierHealth(): Promise<SupplierHealth[]> {
  try {
    const supabase = await createClient()

    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id')
      .eq('is_active', true)

    const results: SupplierHealth[] = []

    for (const supplier of suppliers || []) {
      const service = new SupplierFallbackService(supplier.id)
      const health = await service.getHealthStatus()
      if (health) {
        results.push(health)
      }
    }

    return results
  } catch {
    return []
  }
}

/**
 * Get overall system health summary
 */
export async function getSystemHealthSummary(): Promise<{
  totalSuppliers: number
  onlineSuppliers: number
  offlineSuppliers: number
  freshCache: number
  staleCache: number
  missingCache: number
  lastGlobalSync: Date | null
  criticalIssues: string[]
}> {
  const healthStatuses = await getAllSupplierHealth()

  const onlineCount = healthStatuses.filter((h) => h.isOnline).length
  const freshCacheCount = healthStatuses.filter((h) => h.cacheStatus === 'fresh').length
  const staleCacheCount = healthStatuses.filter((h) => h.cacheStatus === 'stale').length
  const missingCacheCount = healthStatuses.filter((h) => h.cacheStatus === 'missing').length

  const lastSyncs = healthStatuses
    .map((h) => h.lastSuccessfulSync)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())

  const criticalIssues: string[] = []

  // Check for issues
  for (const health of healthStatuses) {
    if (!health.isOnline) {
      criticalIssues.push(`${health.supplierName} er offline`)
    }
    if (health.cacheStatus === 'stale') {
      criticalIssues.push(`${health.supplierName} har forældet cache`)
    }
    if (health.failureCount >= 3) {
      criticalIssues.push(`${health.supplierName} har ${health.failureCount} fejl`)
    }
  }

  return {
    totalSuppliers: healthStatuses.length,
    onlineSuppliers: onlineCount,
    offlineSuppliers: healthStatuses.length - onlineCount,
    freshCache: freshCacheCount,
    staleCache: staleCacheCount,
    missingCache: missingCacheCount,
    lastGlobalSync: lastSyncs.length > 0 ? lastSyncs[0] : null,
    criticalIssues,
  }
}

/**
 * Execute with fallback - wraps an API call with automatic fallback
 */
export async function executeWithFallback<T>(
  supplierId: string,
  apiCall: () => Promise<T>,
  fallbackFn: () => Promise<T | null>,
  options?: { timeout?: number }
): Promise<FallbackResult<T>> {
  const timeout = options?.timeout || 10000

  try {
    // Try API call with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const result = await Promise.race([
      apiCall(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ])

    clearTimeout(timeoutId)

    return {
      data: result,
      source: 'api',
      isStale: false,
      cachedAt: new Date(),
    }
  } catch {
    // API failed, try fallback
    const fallbackData = await fallbackFn()

    if (fallbackData !== null) {
      return {
        data: fallbackData,
        source: 'cache',
        isStale: true,
        cachedAt: null,
        warning: 'Bruger cached data - leverandør API er utilgængelig',
      }
    }

    throw new Error('Både API og fallback fejlede')
  }
}
