/**
 * Personlige notifikationer (Henrik 2026-10-10: "Hvis en bruger kan vælge notifikationer i UI, skal senders respektere
 * valget"). Én indgang for alle afsendere: notifyUser(userId, event, indhold) sender KUN når brugeren selv har slået
 * kanalen til i Indstillinger → Notifikationer (standard: fra — ingen overraskende mails).
 *
 * Kanaler: e-mail (Microsoft Graph). Push findes ikke endnu → vises som "ikke tilgængelig" i UI'et.
 * Hændelser med afsender i dag: offer_signed, offer_viewed (til tilbuddets opretter), new_message (intern besked til
 * modtageren), new_lead (lead tildelt brugeren). daily_summary har ingen personlig afsender → "ikke tilgængelig".
 *
 * Kaster aldrig (en notifikation må ikke vælte hovedhandlingen). Uden kolonnen profiles.notification_preferences
 * (migration 00220) springes alt over. Server-only; bevidst IKKE 'use server'.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { NOTIFY_AVAILABILITY, type NotifyEvent } from '@/lib/notifications/events'
export type { NotifyEvent } from '@/lib/notifications/events'

export type NotifyContent = { subject: string; html: string; text: string }
type Transport = (msg: NotifyContent & { to: string }) => Promise<{ delivered: boolean; error?: string }>

let transportOverride: Transport | null = null
/** Kun til tests (harness) — ingen live-mail. */
export function setUserNotifyTransport(t: Transport | null): void {
  transportOverride = t
}

async function defaultTransport(msg: NotifyContent & { to: string }): Promise<{ delivered: boolean; error?: string }> {
  const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
  if (!isGraphConfigured()) return { delivered: false, error: 'graph_not_configured' }
  const r = await sendEmailViaGraph({ to: msg.to, subject: msg.subject, html: msg.html, text: msg.text })
  return { delivered: !!r.success, error: r.error }
}

export type NotifyOutcome = 'sent' | 'skipped' | 'failed'

export async function notifyUser(userId: string | null | undefined, event: NotifyEvent, content: NotifyContent): Promise<NotifyOutcome> {
  try {
    if (!userId || !NOTIFY_AVAILABILITY[event]?.email) return 'skipped'
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('profiles')
      .select('email, is_active, notification_preferences')
      .eq('id', userId)
      .maybeSingle()
    if (error || !data) return 'skipped' // fx kolonnen findes ikke endnu (00220)
    const p = data as { email: string | null; is_active: boolean | null; notification_preferences: Record<string, { email?: boolean }> | null }
    if (p.is_active === false) return 'skipped'
    if (p.notification_preferences?.[event]?.email !== true) return 'skipped' // standard: fra
    // Profilens e-mail; ellers login-adressen (Auth)
    let to = (p.email ?? '').trim()
    if (!to) to = ((await admin.auth.admin.getUserById(userId)).data?.user?.email ?? '').trim()
    if (!to) return 'skipped'
    const r = await (transportOverride ?? defaultTransport)({ ...content, to })
    if (!r.delivered) {
      logger.warn('notifyUser: ikke leveret', { entityId: userId, metadata: { event, reason: r.error ?? null } })
      return 'failed'
    }
    return 'sent'
  } catch (err) {
    logger.warn('notifyUser failed', { entityId: userId ?? undefined, metadata: { event }, error: err })
    return 'failed'
  }
}
