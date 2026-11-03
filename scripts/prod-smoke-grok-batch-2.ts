/**
 * PRODUCTION smoke efter Grok batch 2 (tilbageringning, assistent, varekatalog, driftsundtagelser, montør-kundelink) —
 * READ ONLY. Kører de nye kodestiers læsninger med samme kolonner som koden, som rigtige brugere (RLS via role-probe;
 * aktive admin/montør), uden at oprette eller ændre noget. Tjekker at ingen udgående rækker (mail/e-conomic/SMS/
 * webhook/udbakke/indkøb), assistent-opgaver eller telefoni-tabeller er kommet siden --since, og at skemaet er uændret.
 *   npx tsx scripts/prod-smoke-grok-batch-2.ts [--since ISO]
 * Ingen personværdier ud — kun antal og tjek-resultater.
 */
import { withProdReadOnlyRoleProbe, maskDbError } from './prod-readonly'

const sinceIdx = process.argv.indexOf('--since')
const since = sinceIdx > 0 ? String(process.argv[sinceIdx + 1]) : new Date(Date.now() - 60 * 60 * 1000).toISOString()
if (Number.isNaN(Date.parse(since))) throw new Error('ugyldig --since')

const RULES = `('assistant_missed_call','assistant_callback')`
// Samme kolonner/filtre som koden (cti/queue, crm-assistant, supplier-catalogue-lookup, operational-exceptions, my-jobs)
const READS: Array<[string, string]> = [
  ['tilbageringningskø', `SELECT id, title, description, status, due_date, customer_id, service_case_id, created_at, auto_rule, assigned_to FROM customer_tasks
    WHERE auto_rule IN ${RULES} AND status <> 'done' ORDER BY due_date LIMIT 50`],
  ['assistent: job i morgen', `SELECT id, title, scheduled_date, status, case_id FROM work_orders WHERE scheduled_date = (now() AT TIME ZONE 'Europe/Copenhagen')::date + 1
    AND status IN ('planned','in_progress') ORDER BY title LIMIT 40`],
  ['assistent: sag-opslag', `SELECT id, case_number, title, customer_id FROM service_cases WHERE is_proposal = false LIMIT 5`],
  ['katalog: offentlige kolonner', `SELECT id, supplier_id, supplier_sku, supplier_name, unit, ean, is_available, last_synced_at FROM supplier_products LIMIT 5`],
  ['katalog: leverandørnavne', `SELECT id, name FROM suppliers LIMIT 5`],
  ['drift: tilbageringninger (antal)', `SELECT count(*) n FROM customer_tasks WHERE auto_rule IN ${RULES} AND status <> 'done'`],
  ['drift: job i dag/uge', `SELECT count(*) n FROM work_orders WHERE scheduled_date BETWEEN (now() AT TIME ZONE 'Europe/Copenhagen')::date - 6 AND (now() AT TIME ZONE 'Europe/Copenhagen')::date + 6 AND status IN ('planned','in_progress')`],
  ['drift: åbne sager (fuldmagt)', `SELECT id, case_number, title, customer_id, status FROM service_cases WHERE is_proposal = false AND status NOT IN ('closed','converted','cancelled') ORDER BY id LIMIT 1000`],
  ['drift: kontrakt-dokumenter', `SELECT id, customer_id, service_case_id, document_type, description FROM customer_documents WHERE document_type = 'contract' ORDER BY id LIMIT 1000`],
  ['montør-job: kundelink', `SELECT id, title, scheduled_date, status, case_id, customer_id FROM work_orders ORDER BY scheduled_date DESC LIMIT 20`],
]
const ADMIN_READS: Array<[string, string]> = [
  ['assistent/drift: mail uden sag', `SELECT id, subject, customer_id FROM incoming_emails WHERE is_archived = false AND link_status = 'linked' AND service_case_id IS NULL ORDER BY received_at DESC LIMIT 30`],
  ['drift: leverandørfakturaer til gennemgang', `SELECT count(*) n FROM incoming_invoices WHERE requires_manual_review = true AND status IN ('received','awaiting_approval')`],
  ['fakturaskærm: liste', `SELECT id, status, created_at, source_email_id FROM incoming_invoices ORDER BY created_at DESC LIMIT 50`],
]

withProdReadOnlyRoleProbe('prod-smoke-grok-batch-2', async (probe, run) => {
  const res: Array<[string, boolean, string]> = []
  const users = await run(`SELECT role, (array_agg(id ORDER BY created_at))[1]::text AS id FROM profiles
    WHERE is_active AND role IN ('admin', 'montør') GROUP BY role ORDER BY role`)
  const adm = users.find((u) => u.role === 'admin')?.id as string | undefined
  const mon = users.find((u) => u.role === 'montør')?.id as string | undefined
  res.push(['aktive admin og montør fundet', !!adm && !!mon, users.map((u) => u.role).join(',')])
  for (const u of users) {
    const failed: string[] = []
    for (const [label, sql] of READS) {
      const r = await probe(u.id, sql)
      if (!r.ok) failed.push(`${label}: ${r.code}`)
    }
    res.push([`${u.role}: batch 2-læsninger uden kolonne-/RLS-fejl (${READS.length})`, failed.length === 0, failed.join('; ')])
  }
  if (adm) {
    const failed: string[] = []
    for (const [label, sql] of ADMIN_READS) {
      const r = await probe(adm, sql)
      if (!r.ok) failed.push(`${label}: ${r.code}`)
    }
    res.push([`admin: mail-/faktura-læsninger uden fejl (${ADMIN_READS.length})`, failed.length === 0, failed.join('; ')])
  }
  if (mon) {
    // varekatalog: montør (uden materials.view.cost_prices) kan ikke læse kostkolonnen med sin egen session
    const cost = await probe(mon, `SELECT id, cost_price FROM supplier_products LIMIT 1`)
    res.push(['montør: cost_price kan ikke læses med egen session (42501)', !cost.ok && cost.code === '42501', cost.ok ? 'LÆSBAR (!)' : cost.code])
    // 00246: montør ser ingen ukoblede mails og ingen fakturakø
    const m = await probe(mon, `SELECT count(*)::int n FROM incoming_emails WHERE customer_id IS NULL AND service_case_id IS NULL`)
    res.push(['00246: montør ser 0 ukoblede mails', m.ok && m.rows[0].n === 0, m.ok ? `${m.rows[0].n}` : m.code])
  }
  if (adm) {
    const total = Number((await run(`SELECT count(*)::int n FROM incoming_emails`))[0].n)
    const a = await probe(adm, `SELECT count(*)::int n FROM incoming_emails`)
    res.push(['00246: admin ser hele postkassen', a.ok && a.rows[0].n === total, a.ok ? `${a.rows[0].n}/${total}` : a.code])
  }
  const pol = await run(`SELECT coalesce(qual,'') q FROM pg_policies WHERE schemaname='public' AND tablename='incoming_emails' AND cmd='SELECT'`)
  res.push(['00246-politikken uændret (én, effektive rettigheder)', pol.length === 1 && String(pol[0].q).includes("'incoming_invoices.view'") && !/user_role\(\)/.test(String(pol[0].q)), ''])

  // Ingen migration: katalog og tabeltal som efter 00246; ingen telefoni-tabeller
  const schema = (await run(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p,
    (SELECT count(*)::int FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','v','m')) t,
    to_regclass('public.telephony_events')::text te, to_regclass('public.telephony_calls')::text tc`))[0]
  res.push(['ingen migration: katalog 114/273, 165 tabeller/views, ingen telefoni-tabeller', schema.k === 114 && schema.p === 273 && schema.t === 165 && schema.te === null && schema.tc === null, `${schema.k}/${schema.p}, ${schema.t}`])

  // Ingen udgående rækker / eksterne handlinger siden --since
  const tables = await run(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='created_at'
    AND table_name ILIKE ANY (ARRAY['%economic%','%sms%','%outbox%','%webhook%','%telephony%','%sent_email%','%email_log%','%purchase%','%supplier_order%','email_messages','email_events','sent_quotes'])
    ORDER BY 1`)
  const fresh: string[] = []
  for (const t of tables) {
    const n = (await run(`SELECT count(*)::int n FROM public."${String(t.table_name).replace(/"/g, '')}" WHERE created_at >= '${since}'::timestamptz`))[0].n as number
    if (n > 0) fresh.push(`${t.table_name}=${n}`)
  }
  res.push([`ingen udgående rækker i ${tables.length} mail-/e-conomic-/SMS-/webhook-/udbakke-/indkøbstabeller siden ${since}`, fresh.length === 0, fresh.join(', ')])
  const asst = (await run(`SELECT count(*)::int n FROM customer_tasks WHERE auto_rule LIKE 'assistant_%' AND created_at >= '${since}'::timestamptz`))[0].n as number
  res.push(['ingen tilbageringnings-/assistentopgaver oprettet siden deploy', asst === 0, `${asst}`])
  const reminders = (await run(`SELECT count(*)::int n FROM customer_tasks WHERE auto_rule = 'assistant_callback' AND reminder_at IS NOT NULL`))[0].n as number
  res.push(['ingen tilbageringning har reminder_at (ingen Telegram-påmindelse)', reminders === 0, `${reminders}`])

  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} smoke-tjek som forventet — read-only`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
