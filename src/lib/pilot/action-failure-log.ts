/**
 * Pilot 2026-10-30: mislykkede skrivehandlinger i montør-flowet (timer, AO-status, materialer, dokumenter, opgaver,
 * aflevering) returnerede kun en fejltekst til brugeren — intet spor bagefter. Her logges de som 'warning' i
 * system_health_log under service 'user_action' (ikke i ALL_SERVICES → påvirker ikke den samlede driftsstatus, ingen
 * mail/klokke). Læses af scripts/prod-pilot-session-check.ts.
 *
 * Indhold: handling, fejlklasse, afkortet (app-formuleret) fejltekst, bruger-id og evt. entitets-id (uuid) — ingen
 * formularværdier. Fire-and-forget: kaster aldrig og ændrer aldrig resultatet. Højst 30 logninger pr. bruger pr. time
 * pr. serverinstans.
 */
import { getUser } from '@/lib/supabase/server'
import { logHealth } from '@/lib/services/system-health'
import { classifyActionFailure } from '@/lib/pilot/action-failure-class'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const recent = new Map<string, number[]>()

/** Returnerer `result` uændret; logger kun når result.success === false */
export async function trackActionResult<T>(action: string, result: T, entity?: unknown): Promise<T> {
  try {
    const r = result as { success?: boolean; error?: unknown } | null
    if (!r || r.success !== false) return result
    const user = await getUser().catch(() => null)
    const key = user?.id ?? 'anon'
    const now = Date.now()
    const list = (recent.get(key) ?? []).filter((t) => now - t < 3_600_000)
    if (list.length >= 30) return result
    list.push(now)
    recent.set(key, list)
    const message = String(r.error ?? '').replace(/\s+/g, ' ').slice(0, 200)
    await logHealth('user_action', 'warning', `Handling fejlede: ${action}`, {
      kind: 'action_failed',
      action,
      reason: classifyActionFailure(message),
      message,
      user_id: user?.id ?? null,
      entity_id: typeof entity === 'string' && UUID.test(entity) ? entity : null,
    })
  } catch { /* aldrig påvirke flowet */ }
  return result
}
