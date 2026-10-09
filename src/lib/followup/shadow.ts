/**
 * Skygge: motorens opfølgning mod de regler der kører i dag. Kun antal.
 * Ingen afsendelse, ingen id'er i teksten. Samme regler som scripts/prod-followup-shadow.ts.
 */
import { daysBetween } from '@/lib/followup/calendar'
import {
  DEFAULT_FOLLOWUP_CONFIG,
  evaluateFollowups,
  type FollowupConfig,
  type FollowupSnapshot,
  type InvoiceSnap,
  type OfferSnap,
  type ThreadSnap,
} from '@/lib/followup/engine'

export type ShadowOffer = OfferSnap & { created_at: string | null }

export interface FollowupShadowReport {
  offers: number
  invoices: number
  engineOfferReminder: number
  engineSellerTask: number
  engineInvoiceReminder: number
  engineInvoiceManual: number
  deferred: number
  legacyCronWouldSend: number
  legacyAgentWouldSuggest: number
  sameOfferBoth: number
  dashboardFollowup: number
}

export function followupShadowReport(
  snap: { offers: ShadowOffer[]; invoices: InvoiceSnap[]; threads: ThreadSnap[] },
  today: string,
  nowMs: number,
  cfg: FollowupConfig = DEFAULT_FOLLOWUP_CONFIG,
): FollowupShadowReport {
  const full: FollowupSnapshot = snap
  const res = evaluateFollowups(full, today, cfg)
  const count = (rule: string) => res.due.filter((d) => d.rule === rule).length
  const days = cfg.offerReminders.intervalDays
  const windowMs = days * 86_400_000
  const legacyCron = snap.offers.filter((o) => cfg.offerReminders.enabled && o.sent_at && Date.parse(o.sent_at) < nowMs - windowMs
    && (!o.last_reminder_sent || Date.parse(o.last_reminder_sent) < nowMs - windowMs)
    && o.reminder_count < cfg.offerReminders.maxCount
    && !(o.valid_until && Date.parse(`${o.valid_until}T00:00:00Z`) < nowMs))
  const legacyAgent = snap.offers.filter((o) => !o.is_proposal && o.customer_id && o.sent_at
    && daysBetween(o.sent_at, today) >= 7 && !o.has_open_followup_task
    && !(o.valid_until && o.valid_until < today))
  const sameOfferBoth = legacyCron.filter((o) => legacyAgent.some((a) => a.id === o.id)).length
  const dashboardFollowup = snap.offers.filter((o) => !o.is_proposal && !!o.created_at && Date.parse(o.created_at) < nowMs - 7 * 86_400_000).length
  return {
    offers: snap.offers.length,
    invoices: snap.invoices.length,
    engineOfferReminder: count('offer.customer_reminder'),
    engineSellerTask: count('offer.seller_task'),
    engineInvoiceReminder: count('invoice.customer_reminder'),
    engineInvoiceManual: count('invoice.manual_review'),
    deferred: res.deferred.length,
    legacyCronWouldSend: legacyCron.length,
    legacyAgentWouldSuggest: legacyAgent.length,
    sameOfferBoth,
    dashboardFollowup,
  }
}

/** Tekst til Pilot Health. Indeholder aldrig tilbud-, faktura- eller kunde-id. */
export function followupShadowDetail(r: FollowupShadowReport): string {
  return `kun antal, intet sendt · motor tilbud ${r.engineOfferReminder} · sælger ${r.engineSellerTask} · faktura ${r.engineInvoiceReminder} · manuel ${r.engineInvoiceManual} · udskudt ${r.deferred} · cron ville ${r.legacyCronWouldSend} · agent ville ${r.legacyAgentWouldSuggest} · samme tilbud begge ${r.sameOfferBoth} · dashboard ${r.dashboardFollowup} · grundlag ${r.offers} tilbud / ${r.invoices} fakturaer · mail-tråde ikke med`
}

/** Gul når dagens regler rammer samme tilbud to steder, eller motoren ville rykke en faktura som cron ikke sender. */
export function followupShadowLevel(r: FollowupShadowReport): 'green' | 'yellow' {
  return r.sameOfferBoth > 0 || r.engineInvoiceReminder > 0 ? 'yellow' : 'green'
}
