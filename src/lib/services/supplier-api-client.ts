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
  imageUrl: string | null
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
  protected lastCredentialError: string | null = null

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
   * Inject pre-decrypted credentials directly (skips DB query)
   */
  setCredentialsDirect(creds: CredentialInput, apiEndpoint?: string): void {
    this.credentials = creds
    this.lastCredentialError = null
    if (apiEndpoint) {
      this.config.baseUrl = apiEndpoint
    }
  }

  /**
   * Load credentials from encrypted storage
   */
  async loadCredentials(): Promise<boolean> {
    try {
      const result = await getDecryptedCredentials(this.supplierId, 'api')
      if (result.success && result.data) {
        this.credentials = result.data
        this.lastCredentialError = null
        // Update base URL from stored endpoint if available
        if (result.data.api_endpoint) {
          this.config.baseUrl = result.data.api_endpoint
        }
        return true
      }
      this.lastCredentialError = result.error || 'Ingen aktive API-loginoplysninger fundet'
      logger.info(`Supplier ${this.supplierId} credential loading failed: ${this.lastCredentialError}`)
      return false
    } catch (error) {
      this.lastCredentialError = error instanceof Error ? error.message : 'Krypteringsfejl'
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
  private sessionCookies: Record<string, string> = {}
  private priceAccount: string | null = null

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
      // Skip loadCredentials if already injected via setCredentialsDirect
      if (!this.credentials) {
        if (!await this.loadCredentials()) {
          const reason = this.lastCredentialError || 'Ingen aktive API-loginoplysninger fundet for AO'
          await this.updateCredentialStatus('failed', reason)
          return { success: false, message: reason, error: 'NO_CREDENTIALS' }
        }
      }

      if (!this.credentials?.username || !this.credentials?.password) {
        const msg = 'Manglende brugernavn eller adgangskode — udfyld felterne og gem først'
        await this.updateCredentialStatus('failed', msg)
        return { success: false, message: msg, error: 'MISSING_CREDENTIALS' }
      }

      const authenticated = await this.authenticate()
      if (!authenticated) {
        const msg = 'Kunne ikke logge ind på AO — tjek brugernavn og adgangskode'
        await this.updateCredentialStatus('invalid_credentials', msg)
        return { success: false, message: msg, error: 'AUTH_FAILED' }
      }

      await this.updateCredentialStatus('success')
      return { success: true, message: 'Forbindelse til AO er aktiv' }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Ukendt fejl'
      await this.updateCredentialStatus('failed', errorMsg)
      return { success: false, message: `Forbindelsesfejl: ${errorMsg}`, error: errorMsg }
    }
  }

  /**
   * Parse Set-Cookie headers into session store
   */
  private parseCookies(headers: Headers): void {
    const setCookie = headers.getSetCookie?.() || []
    for (const c of setCookie) {
      const [kv] = c.split(';')
      const eqIdx = kv.indexOf('=')
      if (eqIdx > 0) {
        this.sessionCookies[kv.substring(0, eqIdx).trim()] = kv.substring(eqIdx + 1).trim()
      }
    }
  }

  private cookieHeader(): string {
    return Object.entries(this.sessionCookies).map(([k, v]) => `${k}=${v}`).join('; ')
  }

  /**
   * Make AO website API request with session cookies
   */
  private async aoFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const resp = await fetch(`https://ao.dk${path}`, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': this.cookieHeader(),
        ...((options.headers as Record<string, string>) || {}),
      },
      signal: AbortSignal.timeout(this.config.timeout || 30000),
    })
    this.parseCookies(resp.headers)

    if (!resp.ok) {
      throw new Error(`AO API HTTP ${resp.status}: ${resp.statusText}`)
    }

    return resp.json()
  }

  /**
   * Authenticate with AO website using session cookie login.
   * Uses /api/bruger/ValiderBruger endpoint.
   */
  async authenticate(): Promise<boolean> {
    if (!this.credentials?.username || !this.credentials?.password) {
      return false
    }

    try {
      // Get initial session cookie
      const pageResp = await fetch('https://ao.dk/kunde/log-ind-side', {
        signal: AbortSignal.timeout(10000),
      })
      this.parseCookies(pageResp.headers)

      // Login
      const result = await this.aoFetch<{ Status: boolean; Message: string | null }>(
        '/api/bruger/ValiderBruger',
        {
          method: 'POST',
          body: JSON.stringify({
            Brugernavn: this.credentials.username,
            Password: this.credentials.password,
            HuskLogin: true,
            LoginKanal: 'Web',
          }),
        }
      )

      if (!result.Status) {
        return false
      }

      // Get price account
      const userInfo = await this.aoFetch<{ Username: string; PriceAccount: string }>(
        '/api/bruger/GetLoggedInUsernameAndPriceAccount'
      )
      this.priceAccount = userInfo.PriceAccount

      // Mark as authenticated with long expiry (session cookie based)
      this.authToken = {
        accessToken: 'session',
        expiresAt: new Date(Date.now() + SUPPLIER_API_CONFIG.AUTH_TOKEN_TTL_MS),
      }

      return true
    } catch (error) {
      logger.error('AO login failed', { error })
      return false
    }
  }

  /**
   * Search for products in AO catalog via /api/Soeg/QuickSearch
   */
  async searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    await this.ensureAuthenticated()

    try {
      const query = params.query || params.sku || params.ean || ''
      const limit = params.limit || 25
      const start = (params.offset || 0) + 1
      const stop = start + limit - 1

      const data = await this.aoFetch<{
        Count: number
        Produkter: Array<{
          Varenr: string
          Name: string
          ImageUrlMedium: string
          Maalingsenhed: string
          Livscyklus: string
          EAN: string
        }>
      }>(`/api/Soeg/QuickSearch?q=${encodeURIComponent(query)}&a=&start=${start}&stop=${stop}`)

      // Fetch prices for the returned products
      const varenumre = data.Produkter.map((p) => p.Varenr)
      const prices = await this.fetchPrices(varenumre)

      const products: ProductPrice[] = data.Produkter.map((p) => {
        const price = prices.get(p.Varenr)
        return {
          sku: p.Varenr,
          name: p.Name,
          costPrice: price?.DinPris ?? 0,
          listPrice: price?.Listepris ?? null,
          currency: 'DKK',
          unit: p.Maalingsenhed || 'STK',
          isAvailable: p.Livscyklus === 'A',
          stockQuantity: null,
          leadTimeDays: null,
          imageUrl: p.ImageUrlMedium || null,
        }
      })

      // Cache for fallback
      await this.cacheProductPrices(products)

      return {
        products,
        totalCount: data.Count,
        hasMore: stop < data.Count,
      }
    } catch (error) {
      logger.error('AO search failed, falling back to cache', { error })
      return this.getCachedProducts(params)
    }
  }

  /**
   * Fetch netto prices from /api/Pris/HentPriserForKonto
   */
  private async fetchPrices(varenumre: string[]): Promise<Map<string, { DinPris: number; Listepris: number }>> {
    const result = new Map<string, { DinPris: number; Listepris: number }>()
    if (!this.priceAccount || varenumre.length === 0) return result

    try {
      for (let i = 0; i < varenumre.length; i += 50) {
        const batch = varenumre.slice(i, i + 50)
        const prices = await this.aoFetch<Array<{
          Varenr: string
          DinPris: number
          Listepris: number
        }>>(`/api/Pris/HentPriserForKonto?kontonummer=${this.priceAccount}`, {
          method: 'POST',
          body: JSON.stringify(batch),
        })

        if (Array.isArray(prices)) {
          for (const p of prices) {
            result.set(p.Varenr, { DinPris: p.DinPris, Listepris: p.Listepris })
          }
        }
      }
    } catch (error) {
      logger.error('AO price fetch failed', { error })
    }

    return result
  }

  /**
   * Get price for a single product
   */
  async getProductPrice(sku: string): Promise<ProductPrice | null> {
    await this.ensureAuthenticated()

    try {
      // Get product info
      const product = await this.aoFetch<{
        Varenr: string
        Name: string
        ImageUrlMedium: string
        Maalingsenhed: string
        Livscyklus: string
      }>(`/api/Soeg/EnkeltProdukt?varenr=${encodeURIComponent(sku)}`)

      // Get price
      const prices = await this.fetchPrices([sku])
      const price = prices.get(sku)

      const result: ProductPrice = {
        sku: product.Varenr,
        name: product.Name,
        costPrice: price?.DinPris ?? 0,
        listPrice: price?.Listepris ?? null,
        currency: 'DKK',
        unit: product.Maalingsenhed || 'STK',
        isAvailable: product.Livscyklus === 'A',
        stockQuantity: null,
        leadTimeDays: null,
        imageUrl: product.ImageUrlMedium || null,
      }

      await this.cacheProductPrices([result])
      return result
    } catch {
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
      // Fetch prices
      const prices = await this.fetchPrices(skus)

      // For each SKU, build a ProductPrice from DB product info + live price
      const supabase = await createClient()
      const { data: products } = await supabase
        .from('supplier_products')
        .select('supplier_sku, supplier_name, unit, is_available')
        .eq('supplier_id', this.supplierId)
        .in('supplier_sku', skus)

      for (const p of products || []) {
        const price = prices.get(p.supplier_sku)
        if (price) {
          result.set(p.supplier_sku, {
            sku: p.supplier_sku,
            name: p.supplier_name,
            costPrice: price.DinPris,
            listPrice: price.Listepris,
            currency: 'DKK',
            unit: p.unit || 'STK',
            isAvailable: p.is_available,
            stockQuantity: null,
            leadTimeDays: null,
            imageUrl: null,
          })
        }
      }
    } catch {
      // Fallback to cache
      for (const sku of skus) {
        const price = await this.getCachedProductPrice(sku)
        if (price) result.set(sku, price)
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
        .select('supplier_sku, supplier_name, cost_price, list_price, unit, is_available')
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

      const products: ProductPrice[] = data.map((p) => ({
        sku: p.supplier_sku,
        name: p.supplier_name,
        costPrice: p.cost_price ?? 0,
        listPrice: p.list_price,
        currency: 'DKK',
        unit: p.unit || 'STK',
        isAvailable: p.is_available,
        stockQuantity: null,
        leadTimeDays: null,
        imageUrl: null,
      }))

      return { products, totalCount: products.length, hasMore: false }
    } catch {
      return { products: [], totalCount: 0, hasMore: false }
    }
  }

  /**
   * Get cached price for single product (AO)
   */
  private async getCachedProductPrice(sku: string): Promise<ProductPrice | null> {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('supplier_products')
        .select('supplier_sku, supplier_name, cost_price, list_price, unit, is_available')
        .eq('supplier_id', this.supplierId)
        .eq('supplier_sku', sku)
        .maybeSingle()

      if (!data) return null

      return {
        sku: data.supplier_sku,
        name: data.supplier_name,
        costPrice: data.cost_price ?? 0,
        listPrice: data.list_price,
        currency: 'DKK',
        unit: data.unit || 'STK',
        isAvailable: data.is_available,
        stockQuantity: null,
        leadTimeDays: null,
        imageUrl: null,
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
      // Skip loadCredentials if already injected via setCredentialsDirect
      if (!this.credentials) {
        if (!await this.loadCredentials()) {
          const reason = this.lastCredentialError || 'Ingen aktive API-loginoplysninger fundet for LM'
          await this.updateCredentialStatus('failed', reason)
          return { success: false, message: reason, error: 'NO_CREDENTIALS' }
        }
      }

      if (!this.credentials?.username || !this.credentials?.password) {
        const msg = 'Manglende brugernavn eller adgangskode — udfyld felterne og gem først'
        await this.updateCredentialStatus('failed', msg)
        return { success: false, message: msg, error: 'MISSING_CREDENTIALS' }
      }

      if (!this.credentials?.customer_number) {
        const msg = 'Manglende kundenummer — udfyld feltet og gem først'
        await this.updateCredentialStatus('failed', msg)
        return { success: false, message: msg, error: 'MISSING_CUSTOMER_NUMBER' }
      }

      const authenticated = await this.authenticate()
      if (!authenticated) {
        const msg = `Kunne ikke logge ind på ${this.config.baseUrl} — tjek brugernavn/adgangskode/kundenummer`
        await this.updateCredentialStatus('invalid_credentials', msg)
        return { success: false, message: msg, error: 'AUTH_FAILED' }
      }

      await this.updateCredentialStatus('success')
      return { success: true, message: 'Forbindelse til Lemvigh-Müller er aktiv' }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Ukendt fejl'
      await this.updateCredentialStatus('failed', errorMsg)
      return { success: false, message: `Forbindelsesfejl: ${errorMsg}`, error: errorMsg }
    }
  }

  /**
   * Authenticate with LM API using Basic Auth.
   * Validates credentials by making a minimal search request.
   */
  async authenticate(): Promise<boolean> {
    if (!this.credentials?.username || !this.credentials?.password || !this.credentials?.customer_number) {
      return false
    }

    try {
      const token = Buffer.from(
        `${this.credentials.customer_number}:${this.credentials.username}:${this.credentials.password}`
      ).toString('base64')

      // Validate credentials by hitting a lightweight endpoint
      const response = await fetch(`${this.config.baseUrl}/artikler?search=test&pageSize=1`, {
        headers: {
          'Authorization': `Basic ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      })

      if (response.status === 401 || response.status === 403) {
        logger.error(`LM auth rejected: HTTP ${response.status}`)
        return false
      }

      // Accept any non-auth-error response as valid (even 404 means the server is reachable)
      if (!response.ok && response.status >= 500) {
        logger.error(`LM API server error: HTTP ${response.status}`)
        return false
      }

      this.authToken = {
        accessToken: token,
        expiresAt: new Date(Date.now() + SUPPLIER_API_CONFIG.AUTH_TOKEN_TTL_MS),
      }

      return true
    } catch (error) {
      logger.error('LM authentication failed', { error })
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
        imageUrl: null,
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
        imageUrl: null,
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
        imageUrl: null,
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
        imageUrl: null,
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
