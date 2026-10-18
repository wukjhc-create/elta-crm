/**
 * Cron-koersels-log (P1 #9).
 *
 * Foer: kun system-health-check skrev til system_health_log; alle andre cron-fejl endte kun i Vercel-konsollen,
 * saa en cron der fejlede hver nat (fx supplier-sync, incident P-003) var usynlig i UI'et.
 * Nu registreres HVER autoriseret koersel som én raekke i system_health_log (service='cron'):
 *   ok       2xx-svar
 *   warning  4xx-svar efter auth (fx "ikke konfigureret") — koerte, men gjorde intet
 *   error    5xx-svar eller exception
 * 401 (uautoriserede kald) logges IKKE: det er ikke en koersel, og det ville give stoej/spam-flade.
 *
 * Wrapperen aendrer ikke cron'ens adfaerd: samme Response returneres, og logning kan aldrig kaste (logHealth).
 */
import { safeEqual } from '@/lib/security/safe-equal' // AS-10
import { logHealth } from '@/lib/services/system-health'

type RouteHandler = (request: Request) => Promise<Response>

const SUMMARY_MAX = 500

/**
 * Nødstop pr. cron uden kodeændring: env CRON_PAUSED="invoice-reminders,offer-reminders" (kommasepareret, eller "*"
 * for alle). Tom/ikke sat = alle kører (uændret adfærd). Pauset cron udfører INTET og logges som warning.
 * (Vercel: env-ændringer slår igennem ved næste deployment.)
 */
export function isCronPaused(name: string, raw: string | undefined = process.env.CRON_PAUSED): boolean {
  if (!raw) return false
  const names = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return names.includes('*') || names.includes(name.toLowerCase())
}

export function withCronRun(name: string, handler: RouteHandler): RouteHandler {
  return async (request: Request) => {
    const started = Date.now()
    if (isCronPaused(name)) {
      // Cron-review 2026-10-09 (#6): pause-grenen kørte før rutens auth — uautoriserede kald skrev en række pr. kald
      if (!hasCronSecret(request)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })
      }
      await logHealth('cron', 'warning', `${name}: pauset (CRON_PAUSED)`, { cron: name, paused: true, duration_ms: 0 })
      return new Response(JSON.stringify({ success: true, paused: true, cron: name }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    let response: Response
    try {
      response = await handler(request)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await logHealth('cron', 'error', `${name}: exception — ${message}`, { cron: name, duration_ms: Date.now() - started })
      throw err
    }
    if (response.status === 401) return response

    let summary: string | null = null
    let body = ''
    try {
      body = await response.clone().text()
      summary = body.slice(0, SUMMARY_MAX)
    } catch {
      summary = null
    }
    const status = response.status >= 500 ? 'error' : response.status >= 400 ? 'warning' : bodyStatus(body)
    await logHealth('cron', status, `${name}: HTTP ${response.status}`, {
      cron: name,
      http_status: response.status,
      duration_ms: Date.now() - started,
      summary,
    })
    return response
  }
}

/**
 * Cron-review 2026-10-09 (#3): flere crons svarer HTTP 200 selv når kørslen fejlede (payment-report /
 * export-error-notification `status: 'failed'`, email-sync `success: false`, rykkere med `errors[]`) — før blev de
 * logget 'ok', og drifts-dashboard/alarmer forblev grønne.
 */
export function bodyStatus(body: string): 'ok' | 'warning' | 'error' {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return 'ok'
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'ok'
  const b = parsed as { status?: unknown; success?: unknown }
  if (b.status === 'failed' || b.success === false) return 'error'
  return scanNested(parsed as Record<string, unknown>, 0)
}

const RANK = { ok: 0, warning: 1, error: 2 } as const
const worst = (a: 'ok' | 'warning' | 'error', b: 'ok' | 'warning' | 'error') => (RANK[b] > RANK[a] ? b : a)
const positive = (v: unknown) => typeof v === 'number' && v > 0

/**
 * CR-6 (cron-review 2026-10-17): fejl lå indlejret (`summary.errors: 3`, `summary.failed`, `results[].errors[]`) og
 * blev logget 'ok'; "alle afsendelser fejlede" var kun en warning. Gennemgår objekter/arrays til dybde 3:
 * fejl-tal/-lister → warning; `failed > 0` med `sent === 0` på samme niveau → error; indlejret success:false/
 * status 'failed' (én delkørsel) → warning.
 */
function scanNested(o: Record<string, unknown>, depth: number): 'ok' | 'warning' | 'error' {
  let s: 'ok' | 'warning' | 'error' = 'ok'
  if (depth > 0 && (o.status === 'failed' || o.success === false)) s = 'warning'
  const errs = o.errors
  if ((Array.isArray(errs) && errs.length > 0) || positive(errs)) s = worst(s, 'warning')
  if (positive(o.failed)) s = worst(s, o.sent === 0 ? 'error' : 'warning')
  if (depth >= 3) return s
  for (const [k, v] of Object.entries(o)) {
    if (k === 'errors' || !v || typeof v !== 'object') continue
    const items = Array.isArray(v) ? v.slice(0, 50) : [v]
    for (const it of items) {
      if (it && typeof it === 'object' && !Array.isArray(it)) s = worst(s, scanNested(it as Record<string, unknown>, depth + 1))
      if (s === 'error') return s
    }
  }
  return s
}

function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization')
  if (!secret || !header) return false
  return safeEqual(header, `Bearer ${secret}`) // AS-10: ingen længdelæk
}
