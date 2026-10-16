/**
 * O-1 (review 2026-10-16): tilbudsrykkere — plan / dry-run.
 *
 * Henrik 2026-10-16: LIVE-afsendelse af tilbudsrykkere er BLOCKED. Dette modul beregner, hvad cron'en VILLE sende
 * (berettigede tilbud, modtager, udelukkelsesårsager, dedup pr. modtager, loft pr. kørsel) — uden at sende eller skrive
 * noget. Live-afsendelse kræver `OFFER_REMINDERS_LIVE=true` (sættes ikke uden særskilt godkendelse).
 *
 * Almindeligt server-modul (IKKE 'use server'): bruger admin-klienten; kaldes kun fra cron (CRON_SECRET) og fra en
 * gatet server action.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { isOfferExpired } from '@/lib/offers/validity'

/** Højst så mange rykkere pr. kørsel (tidsgrænse 60 s; hver Graph-afsendelse kan tage op til ~8 s) */
export const MAX_OFFER_REMINDERS_PER_RUN = 5
/** Kun tilbud sendt inden for så mange dage — ellers ville første aktivering rykke alle historiske åbne tilbud */
export const OFFER_REMINDER_WINDOW_DAYS = 60

export type OfferReminderExclusion =
  | 'status'
  | 'proposal'
  | 'converted'
  | 'not_sent'
  | 'too_old'
  | 'too_recent'
  | 'cooldown'
  | 'max_count'
  | 'expired'
  | 'superseded'
  | 'inactive_customer'
  | 'no_recipient'
  | 'duplicate_recipient'
  | 'run_cap'

export const OFFER_REMINDER_EXCLUSION_LABELS: Record<OfferReminderExclusion, string> = {
  status: 'Ikke sendt/set (accepteret, afvist, udløbet eller kladde)',
  proposal: 'Forslag — ikke et rigtigt tilbud',
  converted: 'Allerede blevet til en sag',
  not_sent: 'Aldrig sendt',
  too_old: `Sendt for mere end ${OFFER_REMINDER_WINDOW_DAYS} dage siden`,
  too_recent: 'Sendt for nylig (venter interval)',
  cooldown: 'Rykket for nylig (venter interval)',
  max_count: 'Maks. antal rykkere nået',
  expired: 'Gyldighed udløbet',
  superseded: 'Erstattet af nyere revision',
  inactive_customer: 'Kunden er deaktiveret',
  no_recipient: 'Ingen modtager (kunde/faktureringskontakt uden rigtig mail)',
  duplicate_recipient: 'Samme modtager har allerede en rykker i denne kørsel',
  run_cap: `Over loftet på ${MAX_OFFER_REMINDERS_PER_RUN} pr. kørsel (tages næste kørsel)`,
}

export interface OfferReminderCandidate {
  id: string
  offer_number: string | null
  title: string | null
  status: string
  is_proposal: boolean | null
  converted_case_id: string | null
  sent_at: string | null
  last_reminder_sent: string | null
  reminder_count: number | null
  valid_until: string | null
  customer_id: string | null
  customer_name: string | null
  customer_active: boolean | null
  /** kun sat når revisioner er aktive (00203) — ellers null */
  superseded_by: string | null
}

export interface OfferReminderRules {
  now: Date
  intervalDays: number
  maxCount: number
}

/**
 * Ren regel: må tilbuddet rykkes nu? (uden modtager-opslag, dedup og loft — dem tager planOfferReminders)
 * Samme regler som cron'en: kun sendt/set, ikke forslag, ikke konverteret, under maks., interval siden sidste
 * rykker OG siden afsendelse, sendt inden for vinduet, ikke udløbet (dansk dato), ikke afløst, aktiv kunde.
 */
export function evaluateOfferReminder(o: OfferReminderCandidate, rules: OfferReminderRules): OfferReminderExclusion | null {
  const nowMs = rules.now.getTime()
  const intervalMs = rules.intervalDays * 86_400_000
  if (o.status !== 'sent' && o.status !== 'viewed') return 'status'
  if (o.is_proposal) return 'proposal'
  if (o.converted_case_id) return 'converted'
  if (o.superseded_by) return 'superseded'
  if (!o.sent_at) return 'not_sent'
  const sentMs = Date.parse(o.sent_at)
  if (sentMs < nowMs - OFFER_REMINDER_WINDOW_DAYS * 86_400_000) return 'too_old'
  if ((o.reminder_count ?? 0) >= rules.maxCount) return 'max_count'
  if (sentMs >= nowMs - intervalMs) return 'too_recent'
  if (o.last_reminder_sent && Date.parse(o.last_reminder_sent) >= nowMs - intervalMs) return 'cooldown'
  if (isOfferExpired(o.valid_until, rules.now)) return 'expired'
  if (o.customer_active === false) return 'inactive_customer'
  return null
}

export interface OfferReminderPlanItem {
  offerId: string
  offerNumber: string | null
  title: string | null
  customerName: string | null
  /** nr. på den rykker der ville blive sendt (1, 2, …) */
  reminderNumber: number
  recipientEmail: string | null
  recipientName: string | null
  portalUrl: string | null
  /** null = ville blive sendt */
  excluded: OfferReminderExclusion | null
}

export interface OfferReminderPlan {
  generatedAt: string
  live: boolean
  rules: { intervalDays: number; maxCount: number; maxPerRun: number; windowDays: number; enabledInSettings: boolean }
  wouldSend: OfferReminderPlanItem[]
  excluded: OfferReminderPlanItem[]
  excludedCounts: Partial<Record<OfferReminderExclusion, number>>
  scanned: number
}

export function offerRemindersLive(): boolean {
  return process.env.OFFER_REMINDERS_LIVE === 'true'
}

type Db = SupabaseClient

/** Henter kandidater (sendt/set inden for vinduet) og evaluerer dem. Skriver intet. */
export async function planOfferReminders(db: Db, opts: { now?: Date } = {}): Promise<OfferReminderPlan> {
  const now = opts.now ?? new Date()
  const { data: settings } = await db
    .from('company_settings')
    .select('reminder_enabled, reminder_interval_days, reminder_max_count')
    .limit(1)
    .maybeSingle()
  const s = settings as { reminder_enabled?: boolean | null; reminder_interval_days?: number | null; reminder_max_count?: number | null } | null
  const rules: OfferReminderRules = {
    now,
    intervalDays: s?.reminder_interval_days ?? 3,
    maxCount: s?.reminder_max_count ?? 3,
  }

  const windowStart = new Date(now.getTime() - OFFER_REMINDER_WINDOW_DAYS * 86_400_000).toISOString()
  type Row = {
    id: string; offer_number: string | null; title: string | null; status: string; is_proposal: boolean | null
    converted_case_id: string | null; sent_at: string | null; last_reminder_sent: string | null; reminder_count: number | null
    valid_until: string | null; customer_id: string | null
    customer: { company_name: string | null; is_active: boolean | null } | Array<{ company_name: string | null; is_active: boolean | null }> | null
  }
  const rows = await fetchAllRows<Row>((from, to) => db
    .from('offers')
    .select(`id, offer_number, title, status, is_proposal, converted_case_id, sent_at, last_reminder_sent, reminder_count,
      valid_until, customer_id, customer:customers!offers_customer_id_fkey(company_name, is_active)`)
    .in('status', ['sent', 'viewed'])
    .gte('sent_at', windowStart)
    .order('sent_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to))

  const { supersededBy } = await import('@/lib/offers/revisions')
  const { resolveOfferReminderRoute } = await import('@/lib/actions/mail-route-resolvers')
  const { getPortalOfferUrl } = await import('@/lib/utils/portal-link')

  const wouldSend: OfferReminderPlanItem[] = []
  const excluded: OfferReminderPlanItem[] = []
  const excludedCounts: Partial<Record<OfferReminderExclusion, number>> = {}
  const seenRecipients = new Set<string>()
  const exclude = (item: OfferReminderPlanItem, why: OfferReminderExclusion) => {
    item.excluded = why
    excluded.push(item)
    excludedCounts[why] = (excludedCounts[why] ?? 0) + 1
  }

  for (const r of rows) {
    const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer
    const cand: OfferReminderCandidate = {
      id: r.id, offer_number: r.offer_number, title: r.title, status: r.status, is_proposal: r.is_proposal,
      converted_case_id: r.converted_case_id, sent_at: r.sent_at, last_reminder_sent: r.last_reminder_sent,
      reminder_count: r.reminder_count, valid_until: r.valid_until, customer_id: r.customer_id,
      customer_name: cust?.company_name ?? null, customer_active: cust?.is_active ?? null,
      superseded_by: await supersededBy(r.id),
    }
    const item: OfferReminderPlanItem = {
      offerId: r.id, offerNumber: r.offer_number, title: r.title, customerName: cand.customer_name,
      reminderNumber: (r.reminder_count ?? 0) + 1, recipientEmail: null, recipientName: null, portalUrl: null, excluded: null,
    }
    const why = evaluateOfferReminder(cand, rules)
    if (why) { exclude(item, why); continue }

    const route = await resolveOfferReminderRoute(r.id, undefined, db)
    if (!route.ok || !route.route) { exclude(item, 'no_recipient'); continue }
    // pladsholder-mail på auto-oprettede kunder (auto+<nr>@elta-crm.local) afvises ved afsendelse → ingen modtager
    if (/\.local$/i.test(route.route.toEmail.trim())) { exclude(item, 'no_recipient'); continue }
    item.recipientEmail = route.route.toEmail
    item.recipientName = route.route.toName ?? null
    const key = route.route.toEmail.trim().toLowerCase()
    if (seenRecipients.has(key)) { exclude(item, 'duplicate_recipient'); continue }
    if (wouldSend.length >= MAX_OFFER_REMINDERS_PER_RUN) { exclude(item, 'run_cap'); continue }
    seenRecipients.add(key)
    item.portalUrl = r.customer_id ? await getPortalOfferUrl(r.id, r.customer_id, db) : null
    wouldSend.push(item)
  }

  return {
    generatedAt: now.toISOString(),
    live: offerRemindersLive(),
    rules: {
      intervalDays: rules.intervalDays, maxCount: rules.maxCount, maxPerRun: MAX_OFFER_REMINDERS_PER_RUN,
      windowDays: OFFER_REMINDER_WINDOW_DAYS, enabledInSettings: s?.reminder_enabled ?? true,
    },
    wouldSend,
    excluded,
    excludedCounts,
    scanned: rows.length,
  }
}
