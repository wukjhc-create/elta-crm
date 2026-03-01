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
  private lastAuthDetail = ''

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
        const msg = this.lastAuthDetail || 'Kunne ikke logge ind på AO — tjek brugernavn og adgangskode'
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
    this.lastAuthDetail = ''

    if (!this.credentials?.username || !this.credentials?.password) {
      this.lastAuthDetail = 'Manglende brugernavn eller adgangskode'
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
        this.lastAuthDetail = `AO afviste login${result.Message ? `: ${result.Message}` : ' — brugernavn eller adgangskode er forkert'}`
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
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.lastAuthDetail = 'Timeout — ao.dk svarede ikke inden for 10 sekunder'
      } else if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
        this.lastAuthDetail = 'Netværksfejl — kunne ikke nå ao.dk. Tjek netværk.'
      } else {
        this.lastAuthDetail = `Uventet fejl: ${error instanceof Error ? error.message : String(error)}`
      }
      logger.error('AO login failed', { error, metadata: { detail: this.lastAuthDetail } })
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
// Lemvigh-Müller Classic Client (CSV-import based)
// =====================================================

/**
 * LMClassicClient queries the local supplier_products table
 * populated by CSV imports from classic.lemu.dk.
 * No live API — all data comes from periodic CSV uploads.
 */
export class LMClassicClient extends BaseSupplierAPIClient {
  get supplierCode(): string {
    return 'LM'
  }
  get supplierName(): string {
    return 'Lemvigh-Müller'
  }

  async loadCredentials(): Promise<boolean> {
    return true // No credentials needed — CSV import based
  }

  async authenticate(): Promise<boolean> {
    return true // No auth needed
  }

  async testConnection(): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const supabase = await createClient()

      // Count products
      const { count } = await supabase
        .from('supplier_products')
        .select('*', { count: 'exact', head: true })
        .eq('supplier_id', this.supplierId)

      // Get latest import
      const { data: latestImport } = await supabase
        .from('import_batches')
        .select('created_at, total_rows, new_products, updated_prices')
        .eq('supplier_id', this.supplierId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const productCount = count ?? 0
      if (productCount === 0 && !latestImport) {
        return {
          success: false,
          message: 'Ingen produkter importeret endnu. Upload en CSV-prisliste fra classic.lemu.dk.',
          error: 'NO_PRODUCTS',
        }
      }

      const lastDate = latestImport
        ? new Date(latestImport.created_at).toLocaleDateString('da-DK')
        : 'ukendt'

      return {
        success: true,
        message: `LM Classic: ${productCount.toLocaleString('da-DK')} produkter importeret. Seneste import: ${lastDate}`,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Ukendt fejl'
      return { success: false, message: `Fejl: ${msg}`, error: msg }
    }
  }

  async searchProducts(params: ProductSearchParams): Promise<ProductSearchResult> {
    try {
      const supabase = await createClient()
      const limit = params.limit || 50
      let query = supabase
        .from('supplier_products')
        .select('supplier_sku, supplier_name, cost_price, list_price, unit, is_available, ean, lead_time_days')
        .eq('supplier_id', this.supplierId)
        .limit(limit)

      if (params.sku) {
        query = query.eq('supplier_sku', params.sku)
      } else if (params.ean) {
        query = query.eq('ean', params.ean)
      } else if (params.query) {
        const term = sanitizeSearchTerm(params.query)
        query = query.or(`supplier_sku.ilike.%${term}%,supplier_name.ilike.%${term}%,ean.ilike.%${term}%`)
      }

      if (params.category) {
        query = query.eq('category', params.category)
      }

      const { data, count } = await query

      if (!data) return { products: [], totalCount: 0, hasMore: false }

      const products: ProductPrice[] = data.map((p) => ({
        sku: p.supplier_sku,
        name: p.supplier_name,
        costPrice: p.cost_price ?? 0,
        listPrice: p.list_price,
        currency: 'DKK',
        unit: p.unit || 'STK',
        isAvailable: p.is_available,
        stockQuantity: null,
        leadTimeDays: p.lead_time_days,
        imageUrl: null,
      }))

      return { products, totalCount: count ?? products.length, hasMore: products.length === limit }
    } catch {
      return { products: [], totalCount: 0, hasMore: false }
    }
  }

  async getProductPrice(sku: string): Promise<ProductPrice | null> {
    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('supplier_products')
        .select('supplier_sku, supplier_name, cost_price, list_price, unit, is_available, lead_time_days')
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
        leadTimeDays: data.lead_time_days,
        imageUrl: null,
      }
    } catch {
      return null
    }
  }

  async getProductPrices(skus: string[]): Promise<Map<string, ProductPrice>> {
    const result = new Map<string, ProductPrice>()
    if (skus.length === 0) return result

    try {
      const supabase = await createClient()
      const { data } = await supabase
        .from('supplier_products')
        .select('supplier_sku, supplier_name, cost_price, list_price, unit, is_available, lead_time_days')
        .eq('supplier_id', this.supplierId)
        .in('supplier_sku', skus)

      for (const p of data || []) {
        result.set(p.supplier_sku, {
          sku: p.supplier_sku,
          name: p.supplier_name,
          costPrice: p.cost_price ?? 0,
          listPrice: p.list_price,
          currency: 'DKK',
          unit: p.unit || 'STK',
          isAvailable: p.is_available,
          stockQuantity: null,
          leadTimeDays: p.lead_time_days,
          imageUrl: null,
        })
      }
    } catch {
      // Return empty on error
    }

    return result
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
      client = new LMClassicClient(supplierId, {
        baseUrl: SUPPLIER_API_CONFIG.LM_CLASSIC_URL,
      })
    }

    if (client) {
      // LM Classic doesn't need credentials — skip for LM
      if (code !== 'LM' && code !== 'LEMVIGH') {
        await client.loadCredentials()
      }
      this.clients.set(key, client)
    }

    return client
  }

  static clearCache(): void {
    this.clients.clear()
  }
}
