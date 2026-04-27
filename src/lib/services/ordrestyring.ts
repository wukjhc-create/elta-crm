/**
 * Ordrestyring Chip-API Client (REST)
 *
 * Base URL: https://api.ordrestyring.dk/chip-api/
 * Auth: Both query params AND headers (company_code + api_key)
 *
 * Workflow:
 *   1. POST /debitor → opretter kunde, returnerer debitor_id
 *   2. POST /sag     → opretter sag med debitor_id, returnerer sagsnummer
 */

import { logger } from '@/lib/utils/logger'

const CHIP_API_BASE = 'https://api.ordrestyring.dk/chip-api'

// -- Config ----------------------------------------------------------------

interface OrdrestyringConfig {
  apiKey: string
  companyCode: string
}

function getConfig(): OrdrestyringConfig {
  const apiKey = process.env.ORDRESTYRING_API_KEY
  const companyCode = process.env.ORDRESTYRING_COMPANY_CODE
  if (!apiKey || !companyCode) {
    throw new Error('Ordrestyring ikke konfigureret: mangler ORDRESTYRING_API_KEY eller ORDRESTYRING_COMPANY_CODE')
  }
  return { apiKey, companyCode }
}


// -- Public types ----------------------------------------------------------

export interface OrdrestyringCustomer {
  name: string
  address?: string
  postal_code?: string
  city?: string
  email?: string
  phone?: string
  contact_person?: string
}

export interface OrdrestyringLineItem {
  description: string
  quantity: number
  unit?: string
  unit_price?: number
  total?: number
}

export interface OrdrestyringCaseInput {
  title: string
  description?: string
  customer: OrdrestyringCustomer
  line_items?: OrdrestyringLineItem[]
  priority?: string
  reference?: string
  ksr_number?: string
  ean_number?: string
}

export interface OrdrestyringCaseResponse {
  id: string
  case_number: string
  status: string
  created_at: string
}

export interface EndpointAttempt {
  url: string
  method: string
  status: number | null
  ok: boolean
  headers: Record<string, string>
  bodySnippet: string
  error?: string
  latencyMs: number
}

// -- HTTP helpers ----------------------------------------------------------

function authHeaders(companyCode: string, apiKey: string): Record<string, string> {
  const basicToken = Buffer.from(`${companyCode}:${apiKey}`).toString('base64')
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Basic ${basicToken}`,
    'x-api-key': apiKey,
    'x-company-code': companyCode,
    'X-Partner-Id': 'aceve',
    'partner-id': companyCode,
  }
}

/** Append api_key, company_code and partner_id as query params to URL */
function withAuthParams(url: string, companyCode: string, apiKey: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}api_key=${encodeURIComponent(apiKey)}&company_code=${encodeURIComponent(companyCode)}&partner_id=aceve`
}

function captureHeaders(response: Response): Record<string, string> {
  const h: Record<string, string> = {}
  response.headers.forEach((v, k) => { h[k] = v })
  return h
}

// -- REST POST helper (throws on failure) ----------------------------------

async function chipPost<T = any>(
  path: string,
  body: Record<string, unknown>,
  companyCode: string,
  apiKey: string,
): Promise<{ data: T; status: number; headers: Record<string, string>; bodyText: string }> {
  const baseUrl = withAuthParams(`${CHIP_API_BASE}${path}`, companyCode, apiKey)

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: authHeaders(companyCode, apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })

  const headers = captureHeaders(response)
  const bodyText = await response.text()

  if (!response.ok) {
    // FULL debug: show everything the server sends back
    const err = new Error(
      `Chip-API HTTP ${response.status} på ${path}\n` +
      `URL: ${CHIP_API_BASE}${path}\n` +
      `Response body (fuldt): ${bodyText.slice(0, 1000)}\n` +
      `Response headers: ${JSON.stringify(headers, null, 2)}`
    ) as any
    err.httpStatus = response.status
    err.url = baseUrl
    err.responseHeaders = headers
    err.responseBody = bodyText.slice(0, 1000)
    throw err
  }

  let data: T
  try {
    data = JSON.parse(bodyText) as T
  } catch {
    throw new Error(`Chip-API svarede med ugyldigt JSON fra ${path}: ${bodyText.slice(0, 500)}`)
  }

  return { data, status: response.status, headers, bodyText }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a debitor + sag in Ordrestyring via Chip-API.
 */
export async function createOrdrestyringCase(
  input: OrdrestyringCaseInput,
): Promise<OrdrestyringCaseResponse> {
  const config = getConfig()

  // -- Step 1: Create debitor ---
  const debitorPayload = {
    firma_kode: String(config.companyCode),
    navn: input.customer.name,
    adresse: input.customer.address || '',
    postnr: input.customer.postal_code || '',
    by: input.customer.city || '',
    email: input.customer.email || '',
    telefon: input.customer.phone || '',
    kontaktperson: input.customer.contact_person || '',
  }

  logger.info('Creating Ordrestyring debitor', {
    entity: 'service_case',
    metadata: { customer: input.customer.name, baseUrl: CHIP_API_BASE },
  })

  const debitorResult = await chipPost<any>('/debitor', debitorPayload, config.companyCode, config.apiKey)
  const debitorId = debitorResult.data.debitor_id
    || debitorResult.data.id
    || debitorResult.data.Id
    || debitorResult.data.DebitorId

  if (!debitorId) {
    throw new Error(`Debitor oprettet men intet debitor_id: ${debitorResult.bodyText.slice(0, 300)}`)
  }

  // -- Step 2: Create sag ---
  const sanitizedLineItems = (input.line_items || [])
    .filter((li) => li.description?.trim() && li.quantity > 0)
    .map((li, idx) => ({
      position: idx + 1,
      beskrivelse: li.description.trim(),
      antal: li.quantity,
      enhed: li.unit || 'stk',
      enhedspris: li.unit_price || 0,
      total: li.total || (li.quantity * (li.unit_price || 0)),
    }))

  const sagPayload: Record<string, unknown> = {
    firma_kode: String(config.companyCode),
    debitor_id: debitorId,
    titel: input.title,
    beskrivelse: input.description || '',
    reference: input.reference || '',
    prioritet: mapPriority(input.priority),
    linjer: sanitizedLineItems,
  }
  if (input.ksr_number) sagPayload.ksr_nummer = input.ksr_number
  if (input.ean_number) sagPayload.ean_nummer = input.ean_number

  logger.info('Creating Ordrestyring sag', {
    entity: 'service_case',
    metadata: { debitorId, reference: input.reference, lineItems: sanitizedLineItems.length },
  })

  const sagResult = await chipPost<any>('/sag', sagPayload, config.companyCode, config.apiKey)

  const caseNumber = sagResult.data.sagsnummer
    || sagResult.data.sag_nummer
    || sagResult.data.case_number
    || sagResult.data.nummer
    || sagResult.data.id
    || sagResult.data.Id

  const caseId = sagResult.data.id || sagResult.data.Id || sagResult.data.sag_id || caseNumber

  logger.info('Ordrestyring sag created', {
    entity: 'service_case',
    metadata: { caseId, caseNumber, baseUrl: CHIP_API_BASE },
  })

  return {
    id: String(caseId || ''),
    case_number: String(caseNumber || ''),
    status: sagResult.data.status || 'created',
    created_at: sagResult.data.oprettet || sagResult.data.created_at || new Date().toISOString(),
  }
}

/**
 * Route discovery — probe many paths in parallel to find valid Symfony routes.
 * Any response that is NOT the standard Symfony 404 "No resource found" is interesting.
 */
export async function testOrdrestyringConnection(): Promise<{
  ok: boolean
  endpoint: string
  method?: string
  endpointsTried: string[]
  httpStatus?: number
  graphqlType?: string
  latencyMs?: number
  error?: string
  rawAttempts: EndpointAttempt[]
}> {
  const config = getConfig()
  const BASE = 'https://api.ordrestyring.dk'

  // Probe all plausible Symfony route paths
  const paths = [
    '/',
    '/api',
    '/api/v1',
    '/api/v2',
    '/api/debitor',
    '/api/v1/debitor',
    '/api/v2/debitor',
    '/v1',
    '/v2',
    '/v1/debitor',
    '/v2/debitor',
    '/debitor',
    '/chip-api',
    '/chip-api/v1',
    '/chip-api/v2',
    '/chip/v1',
    '/chip/v2',
    '/aceve',
    '/aceve/api',
    '/aceve/api/v1',
    '/aceve/v1/debitor',
    '/external',
    '/external/api',
    '/external/v1',
    '/partner',
    '/partner/api',
    '/integration',
    '/integration/v1',
  ]

  const hdrs = authHeaders(config.companyCode, config.apiKey)

  // Fire all probes in parallel
  const probes = paths.map(async (path): Promise<EndpointAttempt> => {
    const url = withAuthParams(`${BASE}${path}`, config.companyCode, config.apiKey)
    const start = Date.now()
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: hdrs,
        signal: AbortSignal.timeout(8_000),
      })
      const latencyMs = Date.now() - start
      const headers = captureHeaders(res)
      const bodyText = await res.text()
      return {
        url: `${BASE}${path}`,
        method: 'GET',
        status: res.status,
        ok: res.ok,
        headers,
        bodySnippet: bodyText.slice(0, 500),
        latencyMs,
      }
    } catch (err: any) {
      return {
        url: `${BASE}${path}`,
        method: 'GET',
        status: null,
        ok: false,
        headers: {},
        bodySnippet: '',
        error: err.name === 'TimeoutError' ? 'Timeout' : err.message,
        latencyMs: Date.now() - start,
      }
    }
  })

  const results = await Promise.all(probes)
  const tried = results.map((r) => r.url)

  // Find any response that is NOT "404 No resource found" — those are interesting
  const interesting = results.filter((r) =>
    r.status !== null && r.status !== 404
  )

  // Best: a 2xx response
  const ok2xx = interesting.find((r) => r.ok)
  if (ok2xx) {
    return {
      ok: true,
      endpoint: ok2xx.url,
      method: `GET ${ok2xx.url}`,
      endpointsTried: tried,
      httpStatus: ok2xx.status!,
      graphqlType: `HTTP ${ok2xx.status} — ROUTE FUNDET!`,
      latencyMs: ok2xx.latencyMs,
      rawAttempts: results,
    }
  }

  // Next best: any non-404 (401, 403, 405 etc = route exists but auth/method wrong)
  if (interesting.length > 0) {
    const best = interesting[0]
    return {
      ok: true, // Route exists even if auth fails
      endpoint: best.url,
      method: `GET ${best.url}`,
      endpointsTried: tried,
      httpStatus: best.status!,
      graphqlType: `HTTP ${best.status} — Route eksisterer! (${interesting.length} non-404 svar)`,
      latencyMs: best.latencyMs,
      rawAttempts: results,
    }
  }

  // All 404 — log full diagnostics and give clear support message
  const diagnosticLog = results.map((r) => {
    const status = r.status ?? 'ERR'
    const body = r.bodySnippet ? ` → ${r.bodySnippet.slice(0, 100)}` : ''
    return `${status} ${r.url}${body}`
  }).join('\n')

  // Log the full scan so it's available in Vercel logs for support
  logger.error('Ordrestyring route discovery failed — all paths returned 404', {
    entity: 'integration',
    metadata: {
      pathsScanned: paths.length,
      server: 'Symfony/PHP on IIS (Azure)',
      companyCode: config.companyCode,
      diagnosticLog,
    },
  })

  return {
    ok: false,
    endpoint: BASE,
    endpointsTried: tried,
    error:
      `⚠️ ALLE ${paths.length} PATHS GAV 404 — KONTAKT ORDRESTYRING SUPPORT\n\n` +
      `Serveren svarer (Symfony/PHP på IIS/Azure), men ingen API-routes matcher.\n` +
      `Dette er IKKE et credentials-problem — det er et routing/licens-problem.\n\n` +
      `📧 Send følgende til Ordrestyring support:\n` +
      `─────────────────────────────────────\n` +
      `Firma: Elta Solar ApS\n` +
      `Company Code: ${config.companyCode}\n` +
      `Partner: Aceve\n` +
      `Server: api.ordrestyring.dk (Symfony/PHP 7.1.3, IIS/10.0, Azure ARR)\n` +
      `Fejl: "No resource found at this url" på alle ${paths.length} endpoints\n` +
      `Spørgsmål: Hvad er den korrekte API base URL for Chip-API?\n` +
      `           Er vores API-adgang aktiveret?\n` +
      `─────────────────────────────────────\n\n` +
      `FULD SCAN LOG (gem dette):\n${diagnosticLog}`,
    rawAttempts: results,
  }
}

function mapPriority(priority?: string): string {
  switch (priority) {
    case 'urgent': return 'høj'
    case 'high': return 'høj'
    case 'medium': return 'normal'
    case 'low': return 'lav'
    default: return 'normal'
  }
}
