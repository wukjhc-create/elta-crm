/**
 * Deterministisk opfoelgningsmotor (P3 #16) — REN funktion: snapshot + dato + konfiguration -> liste af
 * "opfoelgning forfalden". Ingen DB, ingen netvaerk, ingen afsendelse, intet LLM.
 *
 * Samme input giver altid samme output (stabil sortering og stabile noegler). Motoren BESLUTTER kun; udfoerelse
 * (forslag i Agent Inbox, interne opgaver, og — efter beslutning — kundemails bag AGENT_LIVE_SEND_ENABLED) er
 * adskilt. Den erstatter IKKE de eksisterende crons endnu (de koerer uaendret, se designdokumentet).
 *
 * Samlede regler (loeser konflikter fra kortlaegningen):
 *   offer.customer_reminder  kundepaamindelse paa sendt/set tilbud: foerste efter `intervalDays` fra afsendelse,
 *                            derefter hver `intervalDays`, max `maxCount`; kun mens tilbuddet er gyldigt (til og med
 *                            sidste dag, lokal kalender).
 *   offer.seller_task        intern opgave til saelger naar paamindelserne er BRUGT OP (eller slaaet fra) og der er gaaet
 *                            `sellerTaskAfterDays` siden afsendelse — ikke parallelt med kundepaamindelser.
 *   invoice.customer_reminder rykker L1/L2 ved >= 3/10 dage efter forfald, aldrig samme niveau to gange, min.
 *                            `cooldownDays` kalenderdage mellem rykkere.
 *   invoice.manual_review    L3 (>= 20 dage): ingen mail — manuel vurdering.
 *   mail.reply_task          ubesvaret kundetraad: intern opgave efter 1 kalenderdag; prioritet efter alder.
 *   Loft: højst ÉN kundepaamindelse pr. kunde pr. dag (faktura foer tilbud; aeldste foerst). Resten udskydes.
 */
import { daysBetween, validOn } from '@/lib/followup/calendar'

export interface OfferSnap {
  id: string; customer_id: string | null; status: string; is_proposal?: boolean
  sent_at: string | null; valid_until: string | null
  reminder_count: number; last_reminder_sent: string | null
  has_open_followup_task: boolean
}
export interface InvoiceSnap {
  id: string; customer_id: string | null; status: string; invoice_type?: string | null; voided_at?: string | null
  final_amount: number; due_date: string | null
  reminder_count: number; last_reminder_at: string | null
}
export interface ThreadSnap {
  key: string; customer_id: string | null
  last_inbound_at: string; last_outbound_at: string | null
  has_open_reply_task: boolean
}
export interface FollowupSnapshot { offers: OfferSnap[]; invoices: InvoiceSnap[]; threads: ThreadSnap[] }

export interface FollowupConfig {
  offerReminders: { enabled: boolean; intervalDays: number; maxCount: number }
  sellerTaskAfterDays: number
  invoice: { levels: Array<{ level: number; minDaysOverdue: number; action: 'customer_reminder' | 'manual_review' }>; cooldownDays: number }
  replyTask: { minAgeDays: number; highAfterDays: number; urgentAfterDays: number }
  maxCustomerRemindersPerDay: number
}

export const DEFAULT_FOLLOWUP_CONFIG: FollowupConfig = {
  offerReminders: { enabled: true, intervalDays: 3, maxCount: 3 },     // = company_settings-defaults i dag
  sellerTaskAfterDays: 7,                                              // = opfoelgningsagentens 7 dage
  invoice: { levels: [ { level: 1, minDaysOverdue: 3, action: 'customer_reminder' }, { level: 2, minDaysOverdue: 10, action: 'customer_reminder' },
    { level: 3, minDaysOverdue: 20, action: 'manual_review' } ], cooldownDays: 5 }, // = REMINDER_RULES i dag
  replyTask: { minAgeDays: 1, highAfterDays: 2, urgentAfterDays: 7 },
  maxCustomerRemindersPerDay: 1,
}

export type FollowupAction = 'customer_reminder' | 'internal_task' | 'manual_review'
export type FollowupRuleId = 'offer.customer_reminder' | 'offer.seller_task' | 'invoice.customer_reminder' | 'invoice.manual_review' | 'mail.reply_task'

export interface FollowupDue {
  rule: FollowupRuleId
  action: FollowupAction
  entity_type: 'offer' | 'invoice' | 'mail_thread'
  entity_id: string
  customer_id: string | null
  /** Stabil noegle pr. cyklus: samme forfaldne opfoelgning giver altid samme noegle (idempotens nedstroems). */
  key: string
  level?: number
  priority: 'normal' | 'high' | 'urgent'
  age_days: number
  reason: string
}
export interface FollowupResult { today: string; due: FollowupDue[]; deferred: Array<FollowupDue & { deferred_reason: string }> }

const ACTION_ORDER: Record<FollowupRuleId, number> = { 'invoice.customer_reminder': 0, 'invoice.manual_review': 1, 'offer.customer_reminder': 2, 'offer.seller_task': 3, 'mail.reply_task': 4 }

export function evaluateFollowups(snap: FollowupSnapshot, today: string, cfg: FollowupConfig = DEFAULT_FOLLOWUP_CONFIG): FollowupResult {
  const due: FollowupDue[] = []

  // ---- tilbud
  for (const o of snap.offers) {
    if (!['sent', 'viewed'].includes(o.status) || o.is_proposal || !o.sent_at || !o.customer_id) continue
    if (!validOn(o.valid_until, today)) continue
    const age = daysBetween(o.sent_at, today)
    const r = cfg.offerReminders
    const remindersLeft = r.enabled && o.reminder_count < r.maxCount
    if (remindersLeft) {
      const anchor = o.last_reminder_sent ?? o.sent_at
      if (daysBetween(anchor, today) >= r.intervalDays) {
        const n = o.reminder_count + 1
        due.push({ rule: 'offer.customer_reminder', action: 'customer_reminder', entity_type: 'offer', entity_id: o.id, customer_id: o.customer_id,
          key: `offer.customer_reminder:${o.id}:${o.sent_at}:${n}`, level: n, priority: 'normal', age_days: age,
          reason: `Påmindelse ${n}/${r.maxCount}: ${age} dage siden afsendelse uden svar` })
      }
    } else if (age >= cfg.sellerTaskAfterDays && !o.has_open_followup_task) {
      due.push({ rule: 'offer.seller_task', action: 'internal_task', entity_type: 'offer', entity_id: o.id, customer_id: o.customer_id,
        key: `offer.seller_task:${o.id}:${o.sent_at}`, priority: age >= cfg.sellerTaskAfterDays * 2 ? 'high' : 'normal', age_days: age,
        reason: r.enabled ? `Påmindelser brugt op (${o.reminder_count}) og ${age} dage uden svar — ring kunden op` : `${age} dage uden svar — følg op` })
    }
  }

  // ---- fakturaer
  for (const inv of snap.invoices) {
    if (inv.status !== 'sent' || inv.voided_at || inv.invoice_type === 'credit' || !(inv.final_amount > 0) || !inv.due_date) continue
    const overdue = daysBetween(inv.due_date, today)
    const eligible = cfg.invoice.levels.filter((l) => overdue >= l.minDaysOverdue && l.level > inv.reminder_count)
    if (!eligible.length) continue
    const next = eligible[0] // laveste niveau der endnu ikke er sendt — aldrig spring over et niveau
    if (inv.last_reminder_at && daysBetween(inv.last_reminder_at, today) < cfg.invoice.cooldownDays) continue
    const rule: FollowupRuleId = next.action === 'manual_review' ? 'invoice.manual_review' : 'invoice.customer_reminder'
    due.push({ rule, action: next.action, entity_type: 'invoice', entity_id: inv.id, customer_id: inv.customer_id,
      key: `${rule}:${inv.id}:L${next.level}`, level: next.level, priority: next.level >= 3 ? 'urgent' : next.level === 2 ? 'high' : 'normal', age_days: overdue,
      reason: next.action === 'manual_review' ? `${overdue} dage over forfald efter ${inv.reminder_count} rykker(e) — manuel vurdering` : `Rykker ${next.level}: ${overdue} dage over forfald` })
  }

  // ---- ubesvarede mails
  for (const t of snap.threads) {
    if (!t.customer_id || t.has_open_reply_task) continue
    if (t.last_outbound_at && t.last_outbound_at >= t.last_inbound_at) continue
    const age = daysBetween(t.last_inbound_at, today)
    if (age < cfg.replyTask.minAgeDays) continue
    const priority = age >= cfg.replyTask.urgentAfterDays ? 'urgent' : age >= cfg.replyTask.highAfterDays ? 'high' : 'normal'
    due.push({ rule: 'mail.reply_task', action: 'internal_task', entity_type: 'mail_thread', entity_id: t.key, customer_id: t.customer_id,
      key: `mail.reply_task:${t.key}:${t.last_inbound_at}`, priority, age_days: age, reason: `Kundemail ubesvaret i ${age} dag(e)` })
  }

  // ---- stabil sortering + loft pr. kunde pr. dag for kundepaamindelser
  due.sort((a, b) => ACTION_ORDER[a.rule] - ACTION_ORDER[b.rule] || b.age_days - a.age_days || a.key.localeCompare(b.key))
  const perCustomer = new Map<string, number>()
  const kept: FollowupDue[] = []
  const deferred: FollowupResult['deferred'] = []
  for (const d of due) {
    if (d.action === 'customer_reminder' && d.customer_id) {
      const n = perCustomer.get(d.customer_id) ?? 0
      if (n >= cfg.maxCustomerRemindersPerDay) { deferred.push({ ...d, deferred_reason: 'loft: kunden får allerede en påmindelse i dag' }); continue }
      perCustomer.set(d.customer_id, n + 1)
    }
    kept.push(d)
  }
  return { today, due: kept, deferred }
}
