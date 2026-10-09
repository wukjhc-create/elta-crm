/**
 * PRODUCTION read-only skygge-koersel af den deterministiske opfoelgningsmotor (P3 #16).
 *   npx tsx scripts/prod-followup-shadow.ts
 * Sammenligner motorens beslutninger for I DAG med de nuvaerende reglers (genskabt her). Printer KUN antal —
 * ingen id'er, navne eller adresser. Aendrer intet, sender intet.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { DEFAULT_FOLLOWUP_CONFIG } from '../src/lib/followup/engine'
import { localDay } from '../src/lib/followup/calendar'
import { followupShadowReport } from '../src/lib/followup/shadow'

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
  const snapOffers = offers.map((o) => ({ ...o, sent_at: iso(o.sent_at), last_reminder_sent: iso(o.last_reminder_sent), created_at: iso(o.created_at) }))
  const snapInv = invoices.map((i) => ({ ...i, last_reminder_at: iso(i.last_reminder_at), voided_at: iso(i.voided_at) }))
  const r = followupShadowReport({ offers: snapOffers, invoices: snapInv, threads: [] }, today, Date.now(), cfg)

  console.log(`--- opfølgning-skygge @ prod:${masked} · dag ${today} (Kbh.) · kundepåmindelser ${cfg.offerReminders.enabled ? `TIL (${cfg.offerReminders.intervalDays} d, max ${cfg.offerReminders.maxCount})` : 'FRA'} ---`)
  console.log(`  grundlag: ${r.offers} sendte/sete tilbud · ${r.invoices} sendte fakturaer`)
  console.log(`  MOTOR   : tilbud-påmindelse=${r.engineOfferReminder} · sælger-opgave=${r.engineSellerTask} · faktura-rykker=${r.engineInvoiceReminder} · faktura manuel=${r.engineInvoiceManual} · udskudt af loft=${r.deferred}`)
  console.log(`  I DAG   : offer-reminders-cron ville sende=${r.legacyCronWouldSend} · opfølgningsagent ville foreslå=${r.legacyAgentWouldSuggest} · heraf SAMME tilbud begge steder=${r.sameOfferBoth} · dashboard "følg op" (created_at)=${r.dashboardFollowup}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
