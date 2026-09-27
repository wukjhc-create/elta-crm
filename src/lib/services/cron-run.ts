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
import { logHealth } from '@/lib/services/system-health'

type RouteHandler = (request: Request) => Promise<Response>

const SUMMARY_MAX = 500

export function withCronRun(name: string, handler: RouteHandler): RouteHandler {
  return async (request: Request) => {
    const started = Date.now()
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
    try {
      summary = (await response.clone().text()).slice(0, SUMMARY_MAX)
    } catch {
      summary = null
    }
    const status = response.status >= 500 ? 'error' : response.status >= 400 ? 'warning' : 'ok'
    await logHealth('cron', status, `${name}: HTTP ${response.status}`, {
      cron: name,
      http_status: response.status,
      duration_ms: Date.now() - started,
      summary,
    })
    return response
  }
}
