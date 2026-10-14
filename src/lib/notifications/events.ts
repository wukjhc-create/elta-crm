/**
 * Personlige notifikationer — hændelser og hvilke kanaler der reelt findes (ren data; bruges af både afsender og
 * indstillingssiden). Henrik 2026-10-10: en kanal der ikke findes endnu vises som "ikke tilgængelig".
 */
export type NotifyEvent = 'new_lead' | 'new_message' | 'offer_signed' | 'offer_viewed' | 'daily_summary'
export type NotifyChannel = 'email' | 'push'

export const NOTIFY_AVAILABILITY: Record<NotifyEvent, Record<NotifyChannel, boolean>> = {
  new_lead: { email: true, push: false },
  new_message: { email: true, push: false },
  offer_signed: { email: true, push: false },
  offer_viewed: { email: true, push: false },
  daily_summary: { email: false, push: false },
}

export const NOTIFY_EVENTS: NotifyEvent[] = ['new_lead', 'new_message', 'offer_signed', 'offer_viewed', 'daily_summary']

/** Gemte indstillinger renset: kun kendte hændelser, kun tilgængelige kanaler kan være til (standard fra). */
export function sanitizeNotifyPreferences(raw: unknown): Record<NotifyEvent, { email: boolean; push: boolean }> {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, { email?: unknown; push?: unknown } | undefined>
  const out = {} as Record<NotifyEvent, { email: boolean; push: boolean }>
  for (const ev of NOTIFY_EVENTS) {
    const v = src[ev] ?? {}
    out[ev] = {
      email: NOTIFY_AVAILABILITY[ev].email && v.email === true,
      push: NOTIFY_AVAILABILITY[ev].push && v.push === true,
    }
  }
  return out
}
