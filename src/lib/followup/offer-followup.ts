/**
 * Tilbudsopfølgning for sælgeren (GO-LIVE N1) — REN funktion: åbne tilbud -> prioriteret "næste skridt".
 * Ingen DB, ingen afsendelse. Hele kalenderdage i dansk tid (followup/calendar).
 *
 * Bevidst ærlig: automatiske kundepåmindelser kører IKKE i prod (cron ikke aktiveret) — kortet lover derfor intet om
 * automatik, men viser hvad sælgeren selv bør gøre. Tærskler følger DEFAULT_FOLLOWUP_CONFIG (3 dage interval,
 * sælgeropgave efter 7 dage).
 */
import { daysBetween, localDay } from '@/lib/followup/calendar'
import { DEFAULT_FOLLOWUP_CONFIG } from '@/lib/followup/engine'

export interface OpenOffer {
  id: string
  offer_number: string | null
  title: string
  status: string
  sent_at: string | null
  viewed_at: string | null
  valid_until: string | null
  final_amount: number | null
  reminder_count: number
  last_reminder_sent: string | null
  customer_name: string | null
  customer_phone: string | null
  has_open_task: boolean
}

export type FollowupStage = 'expired' | 'expiring' | 'call' | 'not_opened' | 'waiting'

export interface OfferFollowupItem {
  offer: OpenOffer
  stage: FollowupStage
  /** 0 udløber snart · 1 ring (set/ubesvaret, eller ikke åbnet ≥ 7 dage) · 2 ikke åbnet < 7 dage / udløbet · 3 afventer */
  priority: 0 | 1 | 2 | 3
  days_since_sent: number
  days_to_expiry: number | null
  headline: string
  detail: string
}

const EXPIRING_WITHIN_DAYS = 3

export function buildOfferFollowups(offers: OpenOffer[], today: string, cfg = DEFAULT_FOLLOWUP_CONFIG): OfferFollowupItem[] {
  const out: OfferFollowupItem[] = []
  for (const o of offers) {
    if (!['sent', 'viewed'].includes(o.status) || !o.sent_at) continue
    const age = Math.max(0, daysBetween(o.sent_at, today))
    const toExpiry = o.valid_until ? daysBetween(today, localDay(o.valid_until)) : null
    const viewed = o.status === 'viewed' || !!o.viewed_at
    const reminders = o.reminder_count > 0 ? ` · ${o.reminder_count} påmindelse(r) sendt` : ''
    const task = o.has_open_task ? ' · åben opfølgningsopgave' : ''

    let item: Omit<OfferFollowupItem, 'offer' | 'days_since_sent' | 'days_to_expiry'>
    if (toExpiry !== null && toExpiry < 0) {
      item = { stage: 'expired', priority: 2, headline: 'Udløbet uden svar', detail: `Udløb for ${-toExpiry} dag(e) siden — forny tilbuddet eller luk det` }
    } else if (toExpiry !== null && toExpiry <= EXPIRING_WITHIN_DAYS && age >= 1) {
      item = { stage: 'expiring', priority: 0, headline: toExpiry === 0 ? 'Udløber i dag' : `Udløber om ${toExpiry} dag(e)`,
        detail: viewed ? 'Kunden har set tilbuddet — ring før det udløber' : 'Kunden har ikke åbnet tilbuddet — ring eller send igen' }
    } else if (age >= cfg.offerReminders.intervalDays && viewed) {
      item = { stage: 'call', priority: 1, headline: 'Set — ikke besvaret',
        detail: `Kunden åbnede tilbuddet, men har ikke svaret i ${age} dage — ring kunden op` }
    } else if (age >= cfg.offerReminders.intervalDays) {
      item = { stage: 'not_opened', priority: age >= cfg.sellerTaskAfterDays ? 1 : 2, headline: 'Ikke åbnet',
        detail: `Sendt for ${age} dage siden og ikke åbnet — tjek at kunden har modtaget mailen` }
    } else {
      item = { stage: 'waiting', priority: 3, headline: viewed ? 'Set af kunden' : 'Afventer kunden',
        detail: `Sendt for ${age} dag(e) siden — ingen handling endnu` }
    }
    out.push({ offer: o, days_since_sent: age, days_to_expiry: toExpiry, ...item, detail: item.detail + reminders + task })
  }
  return out.sort((a, b) => a.priority - b.priority || b.days_since_sent - a.days_since_sent || (a.offer.offer_number ?? a.offer.id).localeCompare(b.offer.offer_number ?? b.offer.id))
}
