'use server'

/**
 * R-9 (pilot-review 2026-10-15): klient-crashes (error boundary) logges i system_health_log (service 'ui'), så admin
 * ser dem på Pilot Health i stedet for at brugeren kun siger "det gik i stykker". Kun indloggede brugere (gate:
 * customers.view = alle 5 roller), afkortede felter, ingen forespørgselsparametre, og højst 10 rapporter pr. bruger pr.
 * time pr. serverinstans (klienten throttler også).
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'

const recent = new Map<string, number[]>()

export async function reportClientErrorAction(input: { digest?: string | null; path?: string | null; message?: string | null }): Promise<{ ok: boolean }> {
  try {
    const { userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) return { ok: false }
    const now = Date.now()
    const list = (recent.get(userId) ?? []).filter((t) => now - t < 3_600_000)
    if (list.length >= 10) return { ok: false }
    list.push(now)
    recent.set(userId, list)
    const path = String(input.path ?? '').split('?')[0].slice(0, 200)
    const digest = String(input.digest ?? '').replace(/[^\w-]/g, '').slice(0, 40)
    const message = String(input.message ?? '').replace(/\s+/g, ' ').slice(0, 300)
    const { logHealth } = await import('@/lib/services/system-health')
    await logHealth('ui', 'error', `Klientfejl på ${path || 'ukendt side'}`, { digest: digest || null, message, user_id: userId })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
