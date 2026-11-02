/**
 * PRODUCTION smoke efter Grok-batchen (mailkort, tidslinje, assistent, opkald, trafiklys) — READ ONLY (2026-11-02).
 *   npx tsx scripts/prod-smoke-grok-batch.ts [--since ISO]
 * Kører de nye kodestiers læsninger som rigtige brugere (RLS via role-probe; admin/salg/montør), uden at oprette eller
 * ændre noget: tidslinjens kilder, tilbageringningskøen, assistentens sags-/dokumentopslag. Tjekker at der ingen
 * telefoni-tabel findes (forslaget er ikke godkendt) og at der ingen udgående rækker (e-conomic/SMS/webhook/udbakke)
 * eller assistent-opgaver er kommet siden --since (default: lige før push).
 * Ingen personværdier ud — kun antal og tjek-resultater.
 */
import { withProdReadOnlyRoleProbe, maskDbError } from './prod-readonly'

const sinceIdx = process.argv.indexOf('--since')
const since = sinceIdx > 0 ? String(process.argv[sinceIdx + 1]) : '2026-11-02T09:10:00+01:00'
if (Number.isNaN(Date.parse(since))) throw new Error('ugyldig --since')

// Samme kolonner som koden (communication-timeline, cti/queue, crm-assistant)
const READS: Array<[string, string]> = [
  ['tidslinje: dokumenter', `SELECT id, title, document_type, created_at, service_case_id FROM customer_documents WHERE source_email_id IS NULL LIMIT 5`],
  ['tidslinje: opgaver', `SELECT id, title, description, created_at, service_case_id, auto_rule FROM customer_tasks LIMIT 5`],
  ['tidslinje: planlægning', `SELECT id, title, status, scheduled_date, case_id, created_at FROM work_orders LIMIT 5`],
  ['kø: tilbageringninger', `SELECT id, title, description, status, due_date, customer_id, service_case_id, created_at, auto_rule FROM customer_tasks
    WHERE auto_rule IN ('assistant_missed_call','assistant_callback') AND status <> 'done' LIMIT 5`],
  ['assistent: sager', `SELECT id, case_number, title, customer_id, status, created_at FROM service_cases WHERE is_proposal = false LIMIT 5`],
  ['assistent: kunder', `SELECT id, company_name FROM customers LIMIT 5`],
]

withProdReadOnlyRoleProbe('prod-smoke-grok-batch', async (probe, run) => {
  const res: Array<[string, boolean, string]> = []
  const users = await run(`SELECT role, (array_agg(id ORDER BY created_at))[1]::text AS id FROM profiles
    WHERE is_active AND role IN ('admin', 'salg', 'montør') GROUP BY role ORDER BY role`)
  res.push(['testbare roller fundet (admin/salg/montør)', users.length >= 2, users.map((u) => u.role).join(',')])
  for (const u of users) {
    const failed: string[] = []
    for (const [label, sql] of READS) {
      const r = await probe(u.id, sql)
      if (!r.ok) failed.push(`${label}: ${r.code}`)
    }
    res.push([`${u.role}: nye læsestier uden kolonne-/RLS-fejl (${READS.length})`, failed.length === 0, failed.join('; ')])
  }
  // incoming_emails læses kun med customers.emails.view (montør har den ikke) — kolonnerne skal findes
  const mail = users.find((u) => u.role === 'admin')
  if (mail) {
    const r = await probe(mail.id, `SELECT id, subject, received_at, service_case_id FROM incoming_emails LIMIT 5`)
    res.push(['admin: tidslinje-mails (kolonner)', r.ok, r.ok ? '' : r.code])
  }

  // customer_notes findes i prod først efter 00245. Indtil da: tidslinjens notekilde er 'unavailable' (ingen advarsel), og
  // note-knapperne på mail-/opkaldskort vises ikke/er deaktiveret (1b002ce4). Rapporteres, fejler ikke.
  const notes = await run(`SELECT to_regclass('public.customer_notes')::text AS t`)
  console.log(`INFO  customer_notes i prod: ${notes[0].t ? 'findes' : 'findes IKKE (før 00245) — notekilden er unavailable, note-knapper skjult/deaktiveret (1b002ce4)'}`)

  const tel = await run(`SELECT to_regclass('public.telephony_events')::text AS t`)
  res.push(['ingen telefoni-tabel (forslag ikke anvendt)', tel[0].t === null, String(tel[0].t ?? '')])

  const tables = await run(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='created_at'
    AND table_name ILIKE ANY (ARRAY['%economic%','%sms%','%outbox%','%webhook%','%telephony%','%sent_email%','%email_log%'])
    ORDER BY 1`)
  const fresh: string[] = []
  for (const t of tables) {
    const n = (await run(`SELECT count(*)::int n FROM public."${String(t.table_name).replace(/"/g, '')}" WHERE created_at >= '${since}'::timestamptz`))[0].n as number
    if (n > 0) fresh.push(`${t.table_name}=${n}`)
  }
  res.push([`ingen udgående rækker i ${tables.length} e-conomic-/SMS-/webhook-/udbakketabeller siden ${since}`, fresh.length === 0, fresh.join(', ')])
  const asst = (await run(`SELECT count(*)::int n FROM customer_tasks WHERE auto_rule LIKE 'assistant_%' AND created_at >= '${since}'::timestamptz`))[0].n as number
  res.push(['ingen assistent-/opkaldsopgaver oprettet siden deploy', asst === 0, `${asst}`])

  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} smoke-tjek som forventet — read-only`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
