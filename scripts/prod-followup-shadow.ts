/**
 * PRODUCTION read-only skygge-koersel af den deterministiske opfoelgningsmotor (P3 #16).
 *   npx tsx scripts/prod-followup-shadow.ts
 * Sammenligner motorens beslutninger for I DAG med de nuvaerende reglers (genskabt her). Printer KUN antal —
 * ingen id'er, navne eller adresser. Aendrer intet, sender intet.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { evaluateFollowups, DEFAULT_FOLLOWUP_CONFIG } from '../src/lib/followup/engine'
import { localDay, daysBetween } from '../src/lib/followup/calendar'

withProdReadOnly('prod-followup-shadow', async (run, masked) => {
  const today = localDay(new Date())
  const s = (await run(`SELECT reminder_enabled, reminder_interval_days, reminder_max_count FROM company_settings LIMIT 1`))[0] ?? {}
  const cfg = { ...DEFAULT_FOLLOWUP_CONFIG, offerReminders: { enabled: s.reminder_enabled ?? true, intervalDays: s.reminder_interval_days ?? 3, maxCount: s.reminder_max_count ?? 3 } }
  const offers = (await run(`SELECT o.id, o.customer_id, o.status::text status, coalesce(o.is_proposal,false) is_proposal, o.sent_at, o.valid_until::text valid_until,
      coalesce(o.reminder_count,0)::int reminder_count, o.last_reminder_sent, o.created_at,
      EXISTS (SELECT 1 FROM customer_tasks t WHERE t.offer_id = o.id AND t.status <> 'done') has_open_followup_task
    FROM offers o WHERE o.status IN ('sent','viewed')`)) as any[]
  const invoices = (await run(`SELECT id, customer_id, status, invoice_type, voided_at, final_amount::float final_amount, due_date::text due_date,
      coalesce(reminder_count,0)::int reminder_count, last_reminder_at FROM invoices WHERE status = 'sent'`)) as any[]
  const iso = (v: any) => (v instanceof Date ? v.toISOString() : v)
  const snapOffers = offers.map((o) => ({ ...o, sent_at: iso(o.sent_at), last_reminder_sent: iso(o.last_reminder_sent) }))
  const snapInv = invoices.map((i) => ({ ...i, last_reminder_at: iso(i.last_reminder_at), voided_at: iso(i.voided_at) }))
  const res = evaluateFollowups({ offers: snapOffers, invoices: snapInv, threads: [] }, today, cfg)
  const count = (rule: string) => res.due.filter((d) => d.rule === rule).length

  // Nuvaerende regler (genskabt efter kortlaegningen)
  const now = Date.now(), N = cfg.offerReminders.intervalDays
  const legacyCron = snapOffers.filter((o) => cfg.offerReminders.enabled && o.sent_at && Date.parse(o.sent_at) < now - N * 864e5
    && (!o.last_reminder_sent || Date.parse(o.last_reminder_sent) < now - N * 864e5) && o.reminder_count < cfg.offerReminders.maxCount
    && !(o.valid_until && Date.parse(`${o.valid_until}T00:00:00Z`) < now))
  const legacyAgent = snapOffers.filter((o) => !o.is_proposal && o.customer_id && o.sent_at && daysBetween(o.sent_at, today) >= 7 && !o.has_open_followup_task
    && !(o.valid_until && o.valid_until < today))
  const both = legacyCron.filter((o) => legacyAgent.some((a) => a.id === o.id)).length
  const dashboard = snapOffers.filter((o) => !o.is_proposal && Date.parse(iso(o.created_at)) < now - 7 * 864e5).length

  console.log(`--- opfølgning-skygge @ prod:${masked} · dag ${today} (Kbh.) · kundepåmindelser ${cfg.offerReminders.enabled ? `TIL (${N} d, max ${cfg.offerReminders.maxCount})` : 'FRA'} ---`)
  console.log(`  grundlag: ${offers.length} sendte/sete tilbud · ${invoices.length} sendte fakturaer`)
  console.log(`  MOTOR   : tilbud-påmindelse=${count('offer.customer_reminder')} · sælger-opgave=${count('offer.seller_task')} · faktura-rykker=${count('invoice.customer_reminder')} · faktura manuel=${count('invoice.manual_review')} · udskudt af loft=${res.deferred.length}`)
  console.log(`  I DAG   : offer-reminders-cron ville sende=${legacyCron.length} · opfølgningsagent ville foreslå=${legacyAgent.length} · heraf SAMME tilbud begge steder=${both} · dashboard "følg op" (created_at)=${dashboard}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
