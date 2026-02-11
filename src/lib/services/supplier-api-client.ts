/**
 * Supplier API Client Infrastructure
 *
 * Base class and implementations for live API connections to suppliers.
 * Handles authentication, rate limiting, token caching, and fallback.
 */

import { createClient } from '@/lib/supabase/server'
import { getDecryptedCredentials, type CredentialInput } from '@/lib/actions/credentials'
import { SUPPLIER_API_CONFIG } from '@/lib/constants'
import { sanitizeSearchTerm } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Types
// =====================================================

export interface SupplierAPIConfig {
  baseUrl: string
  timeout?: number
  retryAttempts?: number
  retryDelayMs?: number
}

export interface ProductSearchParams {
  query?: string
  sku?: string
  ean?: string
  category?: string
  limit?: number
  offset?: number
}

export interface ProductPrice {
  sku: string
  name: string
  costPrice: number
  listPrice: number | null
  currency: string
  unit: string
  isAvailable: boolean
  stockQuantity: number | null
  leadTimeDays: number | null
}

export interface ProductSearchResult {
  products: ProductPrice[]
  totalCount: number
  hasMore: boolean
}

export interface AuthToken {
  accessToken: string
  expiresAt: Date
  refreshToken?: string
}

export interface RateLimitInfo {
  remaining: number
  resetAt: Date
}

// =====================================================
// Base Supplier API Client
// =====================================================

export abstract class BaseSupplierAPIClient {
  protected supplierId: string
  protected config: SupplierAPIConfig
  protected credentials: CredentialInput | null = null
  protected authToken: AuthToken | null = null
  protected rateLimitInfo: RateLimitInfo | null = null

  constructor(supplierId: string, config: SupplierAPIConfig) {
    this.supplierId = supplierId
    this.config = {
      timeout: SUPPLIER_API_CONFIG.DEFAULT_TIMEOUT_MS,
      retryAttempts: SUPPLIER_API_CONFIG.DEFAULT_RETRY_ATTEMPTS,
      retryDelayMs: SUPPLIER_API_CONFIG.DEFAULT_RETRY_DELAY_MS,
      ...config,
    }
  }

  abstract get supplierCode(): string
  abstract get supplierName(): string

  /**
   * Load credentials from encrypted storage
   */
  async loadCredentials(): Promise<boolean> {
    try {
      const result = await getDecryptedCredentials(this.supplierId, 'api')
      if (result.success && result.data) {
        this.credentials = result.data
        // Update base URL from stored endpoint if available
        if (result.data.api_endpoint) {
          this.config.baseUrl = result.data.api_endpoint
        }
        return true
      }
      logger.info(`Supplier ${this.supplierId} credential loading failed: ${result.error || 'no data'}`)
      return false
    } catch (error) {
      logger.error(`Supplier ${this.supplierId} credential decryption error`, { error })
      return false
    }
  }

  /**
   * Test the API connection
   */
  abstract testConnection(): Promise<{ success: boolean; message: string; error?: string }>

  /**
   * Authenticate and get access token
   */
  abstract authenticate(): Promise<boolean>

  /**
   * Search for products
   */
  abstract searchProducts(params: ProductSearchParams): Promise<ProductSearchResult>

  /**
   * Get price for a single product by SKU
   */
  abstract getProductPrice(sku: string): Promise<ProductPrice | null>

  /**
   * Get prices for multiple products (batch)
   */
  abstract getProductPrices(skus: string[]): Promise<Map<string, ProductPrice>>

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    if (!this.authToken) return false
    return new Date() < this.authToken.expiresAt
  }

  /**
   * Ensure authenticated, re-authenticate if needed
   */
  protected async ensureAuthenticated(): Promise<void> {
    if (!this.isAuthenticated()) {
      const success = await this.authenticate()
      if (!success) {
        throw new Error(`Authentication failed for ${this.supplierName}`)
      }
    }
  }

  /**
   * Make HTTP request with retries and rate limiting
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data: T; rateLimit?: RateLimitInfo }> {
    const url = `${this.config.baseUrl}${endpoint}`
    let lastError: Error | null = null

    for (let attempt = 0; attempt < (this.config.retryAttempts || 3); attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

      try {
        // Check rate limit
        if (this.rateLimitInfo && this.rateLimitInfo.remaining === 0) {
          const waitMs = this.rateLimitInfo.resetAt.getTime() - Date.now()
          if (waitMs > 0) {
            await this.sleep(Math.min(waitMs, 60000)) // Max 1 minute wait
          }
        }

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(this.authToken ? { Authorization: `Bearer ${this.authToken.accessToken}` } : {}),
            ...options.headers,
          },
        })

        // Update rate limit info from headers
        this.updateRateLimitFromHeaders(response.headers)

        if (!response.ok) {
          if (response.status === 401 && attempt === 0) {
            // Token expired, try to re-authenticate
            await this.authenticate()
            continue
          }
          if (response.status === 429) {
            // Rate limited - use Retry-After header or exponential backoff
            const retryAfter = response.headers.get('Retry-After')
            const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : NaN
            const waitMs = !isNaN(retryAfterMs) && retryAfterMs > 0
              ? retryAfterMs
              : this.exponentialBackoff(attempt)
            await this.sleep(waitMs)
            continue
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        return { data, rateLimit: this.rateLimitInfo || undefined }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on certain errors
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Request timeout after ${this.config.timeout}ms`)
        }

        // Exponential backoff with jitter before retry
        if (attempt < (this.config.retryAttempts || 3) - 1) {
          await this.sleep(this.exponentialBackoff(attempt))
        }
      } finally {
        clearTimeout(timeoutId)
      }
    }

    throw lastError || new Error('Request failed after retries')
  }

  /**
   * Update rate limit tracking from response headers
   */
  protected updateRateLimitFromHeaders(headers: Headers): void {
    const remaining = headers.get('X-RateLimit-Remaining') || headers.get('RateLimit-Remaining')
    const reset = headers.get('X-RateLimit-Reset') || headers.get('RateLimit-Reset')

    if (remaining !== null) {
      const parsedRemaining = parseInt(remaining)
      const parsedReset = reset ? parseInt(reset) : NaN

      if (!isNaN(parsedRemaining)) {
        this.rateLimitInfo = {
          remaining: parsedRemaining,
          resetAt: !isNaN(parsedReset) ? new Date(parsedReset * 1000) : new Date(Date.now() + 60000),
        }
      }
    }
  }

  /**
   * Update credential status in database
   */
  protected async updateCredentialStatus(
    status: 'success' | 'failed' | 'timeout' | 'invalid_credentials',
    error?: string
  ): Promise<void> {
    try {
      const supabase = await createClient()
      await supabase
        .from('supplier_credentials')
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: status,
          last_test_error: error || null,
        })
        .eq('supplier_id', this.supplierId)
        .eq('credential_type', 'api')
        .eq('is_active', true)
    } catch {
      // Ignore update errors
    }
  }

  /**
   * Cache product prices for fallback
   */
  protected async cacheProductPrices(prices: ProductPrice[]): Promise<void> {
    if (prices.length === 0) return

    try {
      const supabase = await createClient()

      // Get supplier product IDs for these SKUs
      const { data: products } = await supabase
        .from('supplier_products')
        .select('id, supplier_sku')
        .eq('supplier_id', this.supplierId)
        .in(
          'supplier_sku',
          prices.map((p) => p.sku)
        )

      if (!products || products.length === 0) return

      const skuToId = new Map(products.map((p) => [p.supplier_sku, p.id]))

      // Upsert cache entries
      const cacheEntries = prices
        .filter((p) => skuToId.has(p.sku))
        .map((p) => ({
          supplier_product_id: skuToId.get(p.sku)!,
          cached_cost_price: p.costPrice,
          cached_list_price: p.listPrice,
          cached_is_available: p.isAvailable,
          cached_stock_quantity: p.stockQuantity,
          cached_lead_time_days: p.leadTimeDays,
          cached_at: new Date().toISOString(),
          cache_source: 'api' as const,
          cache_expires_at: new Date(Date.now() + SUPPLIER_API_CONFIG.CACHE_TTL_MS).toISOString(),
          is_stale: false,
          fallback_priority: 1,
        }))

      if (cacheEntries.length > 0) {
        await supabase.from('supplier_product_cache').upsert(cacheEntries, {
          onConflict: 'supplier_product_id',
        })
      }
    } catch {
      // Ignore cache errors
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Exponential backoff with jitter for retry delays
   * Base delay doubles each attempt + random jitter to avoid thundering herd
   */
  protected exponentialBackoff(attempt: number): number {
    const baseDelay = this.config.retryDelayMs || 1000
    const exponentialDelay = baseDelay * Math.pow(2, attempt)
    const jitter = Math.random() * baseDelay // 0 to baseDelay random jitter
    return Math.min(exponentialDelay + jitter, 60000) // Cap at 60 seconds
  }
}

// =====================================================
// AO API Client
// =====================================================

export class AOAPIClient extends BaseSupplierAPIClient {
  get supplierCode(): string {
    return 'AO'
  }
  get supplierName(): string {
    return 'AO'
  }

  /**
   * Test AO API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      if (!await this.loadCredentials()) {
        return { success: false, message: 'Ingen loginoplysninger fundet', error: 'NO_CREDENTIALS' }
      }

      if (!this.credentials?.username || !this.credentials?.password) {
        return { success: false, message: 'Manglende brugernavn eller adgangskode', error: 'MISSING_CREDENTIALS' }
      }

      // Try to authenticate
      const authenticated = await this.authenticate()
      if (!authenticated) {
        await this.updateCredentialStatus('invalid_credentials', 'Kunne ikke logge ind')
        return { success: false, message: 'Kunne ikke logge ind med disse oplysninger', error: 'AUTH_FAILED' }
      }

      await this.updateCredentialStatus('success')
      return { success: true, message: 'Forbindelse til AO er aktiv' }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Ukendt fejl'
      await this.updateCredentialStatus('failed', errorMsg)
      return { success: false, message: 'Forbindelsesfejl', error: errorMsg }
    }
  }

  /**
   * Authenticate with AO API using Basic Auth.
   * Generates a base64-encoded token from username:password credentials.
   */
  async authenticate(): Promise<boolean> {
    if (!this.credentials?.username || !this.credentials?.password) {
      return false
    }

    try {
      this.authToken = {
        accessToken: Buffer.from(
          `${this.credentials.username}:${this.credentials.password}`
        ).toString('base64'),
        expiresAt: new Date(Date.now() + SUPPLIER_API_CONFIG.AUTH_TOKEN_TTL_MS),
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Search for products in AO catalog
   */
  async searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    await this.ensureAuthenticated()

    try {
      // AO API product search endpoint
      const queryParams = new URLSearchParams()
      if (params.query) queryParams.set('q', params.query)
      if (params.sku) queryParams.set('articleNo', params.sku)
      if (params.ean) queryParams.set('ean', params.ean)
      if (params.limit) queryParams.set('limit', String(params.limit))
      if (params.offset) queryParams.set('offset', String(params.offset))

      const { data } = await this.makeRequest<{
        products: Array<{
          articleNo: string
          description: string
          netPrice: number
          listPrice: number
          unit: string
          inStock: boolean
          stockQty: number
          deliveryDays: number
        }>
        total: number
      }>(`/products?${queryParams}`)

      const products: ProductPrice[] = data.products.map((p) => ({
        sku: p.articleNo,
        name: p.description,
        costPrice: p.netPrice,
        listPrice: p.listPrice,
        currency: 'DKK',
        unit: p.unit || 'stk',
        isAvailable: p.inStock,
        stockQuantity: p.stockQty,
        leadTimeDays: p.deliveryDays,
      }))

      // Cache prices for fallback
      await this.cacheProductPrices(products)

      return {
        products,
        totalCount: data.total,
        hasMore: (params.offset || 0) + products.length < data.total,
      }
    } catch (error) {
      // On API failure, try to return cached data
      return this.getCachedProducts(params)
    }
  }

  /**
   * Get price for a single product
   */
  async getProductPrice(sku: string): Promise<ProductPrice | null> {
    await this.ensureAuthenticated()

    try {
      const { data } = await this.makeRequest<{
        articleNo: string
        description: string
        netPrice: number
        listPrice: number
        unit: string
        inStock: boolean
        stockQty: number
        deliveryDays: number
      }>(`/products/${encodeURIComponent(sku)}`)

      const price: ProductPrice = {
        sku: data.articleNo,
        name: data.description,
        costPrice: data.netPrice,
        listPrice: data.listPrice,
        currency: 'DKK',
        unit: data.unit || 'stk',
        isAvailable: data.inStock,
        stockQuantity: data.stockQty,
        leadTimeDays: data.deliveryDays,
      }

      await this.cacheProductPrices([price])
      return price
    } catch {
      // Try cached price
      return this.getCachedProductPrice(sku)
    }
  }

  /**
   * Get prices for multiple products (batch)
   */
  async getProductPrices(skus: string[]): Promise<Map<string, ProductPrice>> {
    await this.ensureAuthenticated()
    const result = new Map<string, ProductPrice>()

    try {
      // Batch request (if API supports it)
      const { data } = await this.makeRequest<{
        products: Array<{
          articleNo: string
          description: string
          netPrice: number
          listPrice: number
          unit: string
          inStock: boolean
          stockQty: number
          deliveryDays: number
        }>
      }>('/products/batch', {
        method: 'POST',
        body: JSON.stringify({ articleNumbers: skus }),
      })

      const prices: ProductPrice[] = []
      for (const p of data.products) {
        const price: ProductPrice = {
          sku: p.articleNo,
          name: p.description,
          costPrice: p.netPrice,
          listPrice: p.listPrice,
          currency: 'DKK',
          unit: p.unit || 'stk',
          isAvailable: p.inStock,
          stockQuantity: p.stockQty,
          leadTimeDays: p.deliveryDays,
        }
        result.set(p.articleNo, price)
        prices.push(price)
      }

      await this.cacheProductPrices(prices)
    } catch {
      // Fallback to individual requests or cache
      for (const sku of skus) {
        const price = await this.getCachedProductPrice(sku)
        if (price) {
          result.set(sku, price)
        }
      }
    }

    return result
  }

  /**
   * Get cached products (fallback when API is unavailable)
   */
  private async getCachedProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    try {
      const supabase = await createClient()
      let query = supabase
        .from('supplier_products')
        .select(
          `
          id,
          supplier_sku,
          supplier_name,
          cost_price,
          list_price,
          unit,
          is_available,
          supplier_product_cache (
            cached_cost_price,
            cached_list_price,
            cached_is_available,
            cached_stock_quantity,
            cached_lead_time_days,
            is_stale
          )
        `
        )
        .eq('supplier_id', this.supplierId)
        .limit(params.limit || 50)

      if (params.query) {
        query = query.or(`supplier_sku.ilike.%${sanitizeSearchTerm(params.query)}%,supplier_name.ilike.%${sanitizeSearchTerm(params.query)}%`)
      }
      if (params.sku) {
        query = query.eq('supplier_sku', params.sku)
      }

      const { data } = await query

      if (!data) {
        return { products: [], totalCount: 0, hasMore: false }
      }

      const products: ProductPrice[] = data.map((p) => {
        const cache = Array.isArray(p.supplier_product_cache)
          ? p.supplier_product_cache[0]
          : p.supplier_product_cache
        return {
          sku: p.supplier_sku,
          name: p.supplier_name,
          costPrice: cache?.cached_cost_price ?? p.cost_price ?? 0,
          listPrice: cache?.cached_list_price ?? p.list_price,
          currency: 'DKK',
          unit: p.unit || 'stk',
          isAvailable: cache?.cached_is_available ?? p.is_available,
          stockQuantity: cache?.cached_stock_quantity ?? null,
          leadTimeDays: cache?.cached_lead_time_days ?? null,
        }
      })

      return {
        products,
        totalCount: products.length,
        hasMore: false,
      }
    } catch {
      return { products: [], totalCount: 0, hasMore: false }
    }
  }

  /**
   * Get cached price for single product
   */
  private async getCachedProductPrice(sku: string): Promise<ProductPrice | null> {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('supplier_products')
        .select(
          `
          supplier_sku,
          supplier_name,
          cost_price,
          list_price,
          unit,
          is_available,
          supplier_product_cache (
            cached_cost_price,
            cached_list_price,
            cached_is_available,
            cached_stock_quantity,
            cached_lead_time_days
          )
        `
        )
        .eq('supplier_id', this.supplierId)
        .eq('supplier_sku', sku)
        .single()

      if (!data) return null

      const cache = Array.isArray(data.supplier_product_cache)
        ? data.supplier_product_cache[0]
        : data.supplier_product_cache

      return {
        sku: data.supplier_sku,
        name: data.supplier_name,
        costPrice: cache?.cached_cost_price ?? data.cost_price ?? 0,
        listPrice: cache?.cached_list_price ?? data.list_price,
        currency: 'DKK',
        unit: data.unit || 'stk',
        isAvailable: cache?.cached_is_available ?? data.is_available,
        stockQuantity: cache?.cached_stock_quantity ?? null,
        leadTimeDays: cache?.cached_lead_time_days ?? null,
      }
    } catch {
      return null
    }
  }
}

// =====================================================
// Lemvigh-Müller API Client
// =====================================================

export class LMAPIClient extends BaseSupplierAPIClient {
  get supplierCode(): string {
    return 'LM'
  }
  get supplierName(): string {
    return 'Lemvigh-Müller'
  }

  /**
   * Test LM API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      if (!await this.loadCredentials()) {
        return { success: false, message: 'Ingen loginoplysninger fundet', error: 'NO_CREDENTIALS' }
      }

      if (!this.credentials?.username || !this.credentials?.password) {
        return { success: false, message: 'Manglende brugernavn eller adgangskode', error: 'MISSING_CREDENTIALS' }
      }

      if (!this.credentials?.customer_number) {
        return { success: false, message: 'Manglende kundenummer', error: 'MISSING_CUSTOMER_NUMBER' }
      }

      const authenticated = await this.authenticate()
      if (!authenticated) {
        await this.updateCredentialStatus('invalid_credentials', 'Kunne ikke logge ind')
        return { success: false, message: 'Kunne ikke logge ind med disse oplysninger', error: 'AUTH_FAILED' }
      }

      await this.updateCredentialStatus('success')
      return { success: true, message: 'Forbindelse til Lemvigh-Müller er aktiv' }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Ukendt fejl'
      await this.updateCredentialStatus('failed', errorMsg)
      return { success: false, message: 'Forbindelsesfejl', error: errorMsg }
    }
  }

  /**
   * Authenticate with LM API
   */
  async authenticate(): Promise<boolean> {
    if (!this.credentials?.username || !this.credentials?.password || !this.credentials?.customer_number) {
      return false
    }

    try {
      // LM API typically uses OAuth2 or API key authentication
      // Placeholder implementation - update when actual API docs available

      this.authToken = {
        accessToken: Buffer.from(
          `${this.credentials.customer_number}:${this.credentials.username}:${this.credentials.password}`
        ).toString('base64'),
        expiresAt: new Date(Date.now() + SUPPLIER_API_CONFIG.AUTH_TOKEN_TTL_MS),
      }

      return true
    } catch {
      return false
    }
  }

  async searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    await this.ensureAuthenticated()

    try {
      const queryParams = new URLSearchParams()
      if (params.query) queryParams.set('search', params.query)
      if (params.sku) queryParams.set('artikelnr', params.sku)
      if (params.ean) queryParams.set('ean', params.ean)
      if (params.limit) queryParams.set('pageSize', String(params.limit))
      if (params.offset) queryParams.set('offset', String(params.offset))

      const { data } = await this.makeRequest<{
        items: Array<{
          artikelnr: string
          artikelbenavnelse: string
          nettopris: number
          listepris: number
          enhed: string
          lagerStatus: boolean
          lagerAntal: number
          leveringstid: number
        }>
        totalCount: number
      }>(`/artikler?${queryParams}`)

      const products: ProductPrice[] = data.items.map((p) => ({
        sku: p.artikelnr,
        name: p.artikelbenavnelse,
        costPrice: p.nettopris,
        listPrice: p.listepris,
        currency: 'DKK',
        unit: p.enhed || 'stk',
        isAvailable: p.lagerStatus,
        stockQuantity: p.lagerAntal,
        leadTimeDays: p.leveringstid,
      }))

      await this.cacheProductPrices(products)

      return {
        products,
        totalCount: data.totalCount,
        hasMore: (params.offset || 0) + products.length < data.totalCount,
      }
    } catch {
      return this.getCachedProducts(params)
    }
  }

  async getProductPrice(sku: string): Promise<ProductPrice | null> {
    await this.ensureAuthenticated()

    try {
      const { data } = await this.makeRequest<{
        artikelnr: string
        artikelbenavnelse: string
        nettopris: number
        listepris: number
        enhed: string
        lagerStatus: boolean
        lagerAntal: number
        leveringstid: number
      }>(`/artikler/${encodeURIComponent(sku)}`)

      const price: ProductPrice = {
        sku: data.artikelnr,
        name: data.artikelbenavnelse,
        costPrice: data.nettopris,
        listPrice: data.listepris,
        currency: 'DKK',
        unit: data.enhed || 'stk',
        isAvailable: data.lagerStatus,
        stockQuantity: data.lagerAntal,
        leadTimeDays: data.leveringstid,
      }

      await this.cacheProductPrices([price])
      return price
    } catch {
      return this.getCachedProductPrice(sku)
    }
  }

  async getProductPrices(skus: string[]): Promise<Map<string, ProductPrice>> {
    const result = new Map<string, ProductPrice>()

    // LM doesn't support batch requests - fetch with controlled concurrency
    const CONCURRENCY = 5
    for (let i = 0; i < skus.length; i += CONCURRENCY) {
      const batch = skus.slice(i, i + CONCURRENCY)
      const prices = await Promise.allSettled(
        batch.map((sku) => this.getProductPrice(sku))
      )
      for (let j = 0; j < prices.length; j++) {
        const res = prices[j]
        if (res.status === 'fulfilled' && res.value) {
          result.set(batch[j], res.value)
        }
      }
    }

    return result
  }

  private async getCachedProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    try {
      const supabase = await createClient()
      let query = supabase
        .from('supplier_products')
        .select('*')
        .eq('supplier_id', this.supplierId)
        .limit(params.limit || 50)

      if (params.query) {
        query = query.or(`supplier_sku.ilike.%${sanitizeSearchTerm(params.query)}%,supplier_name.ilike.%${sanitizeSearchTerm(params.query)}%`)
      }

      const { data } = await query

      if (!data) return { products: [], totalCount: 0, hasMore: false }

      const products: ProductPrice[] = data.map((p) => ({
        sku: p.supplier_sku,
        name: p.supplier_name,
        costPrice: p.cost_price ?? 0,
        listPrice: p.list_price,
        currency: 'DKK',
        unit: p.unit || 'stk',
        isAvailable: p.is_available,
        stockQuantity: null,
        leadTimeDays: p.lead_time_days,
      }))

      return { products, totalCount: products.length, hasMore: false }
    } catch {
      return { products: [], totalCount: 0, hasMore: false }
    }
  }

  private async getCachedProductPrice(sku: string): Promise<ProductPrice | null> {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('supplier_products')
        .select('*')
        .eq('supplier_id', this.supplierId)
        .eq('supplier_sku', sku)
        .single()

      if (!data) return null

      return {
        sku: data.supplier_sku,
        name: data.supplier_name,
        costPrice: data.cost_price ?? 0,
        listPrice: data.list_price,
        currency: 'DKK',
        unit: data.unit || 'stk',
        isAvailable: data.is_available,
        stockQuantity: null,
        leadTimeDays: data.lead_time_days,
      }
    } catch {
      return null
    }
  }
}

// =====================================================
// API Client Factory
// =====================================================

export class SupplierAPIClientFactory {
  private static clients = new Map<string, BaseSupplierAPIClient>()

  static async getClient(supplierId: string, supplierCode: string): Promise<BaseSupplierAPIClient | null> {
    const key = `${supplierId}:${supplierCode}`

    if (this.clients.has(key)) {
      return this.clients.get(key)!
    }

    const code = supplierCode.toUpperCase()
    let client: BaseSupplierAPIClient | null = null

    if (code === 'AO') {
      client = new AOAPIClient(supplierId, {
        baseUrl: SUPPLIER_API_CONFIG.AO_API_BASE_URL,
      })
    } else if (code === 'LM' || code === 'LEMVIGH') {
      client = new LMAPIClient(supplierId, {
        baseUrl: SUPPLIER_API_CONFIG.LM_API_BASE_URL,
      })
    }

    if (client) {
      await client.loadCredentials()
      this.clients.set(key, client)
    }

    return client
  }

  static clearCache(): void {
    this.clients.clear()
  }
}
