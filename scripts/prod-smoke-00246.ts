/**
 * PRODUCTION smoke efter 00246 (incoming_emails SELECT efter effektive rettigheder) — READ ONLY.
 *   npx tsx scripts/prod-smoke-00246.ts [--since ISO]
 * Kører appens mail-læsninger som rigtige brugere (RLS via role-probe; aktive admin/montør): indbakke-liste + tællinger,
 * kundekortets mails, sagens/ordrens Mails-fane, leverandørfakturaers kilde-mail. Tjekker at ingen udgående rækker
 * (e-conomic/SMS/webhook/udbakke/mail) er kommet siden --since. Rolle-skift (salg/bogholderi/serviceleder) kræver
 * skrivning og ligger i den rollback-only prøve (prod-mail-00246-effective.ts).
 * Ingen personværdier ud — kun antal og tjek-resultater.
 */
import { withProdReadOnlyRoleProbe, maskDbError } from './prod-readonly'

const sinceIdx = process.argv.indexOf('--since')
const since = sinceIdx > 0 ? String(process.argv[sinceIdx + 1]) : new Date(Date.now() - 60 * 60 * 1000).toISOString()
if (Number.isNaN(Date.parse(since))) throw new Error('ugyldig --since')
const uuid = (s: string) => { if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Error('ugyldigt id'); return s }

withProdReadOnlyRoleProbe('prod-smoke-00246', async (probe, run) => {
  const res: Array<[string, boolean, string]> = []
  const n = async (sql: string) => Number((await run(sql))[0].n)
  const users = await run(`SELECT role, (array_agg(id ORDER BY created_at))[1]::text AS id FROM profiles
    WHERE is_active AND role IN ('admin', 'montør') GROUP BY role ORDER BY role`)
  const adm = users.find((u) => u.role === 'admin')?.id as string
  if (!adm) throw new Error('ingen aktiv admin')
  // montøren med flest sager i scope
  let montor: string | undefined, best = -1
  for (const m of await run(`SELECT id::text id FROM profiles WHERE is_active AND role = 'montør' ORDER BY created_at`)) {
    const r = await probe(m.id, `SELECT cardinality(public.my_case_scope_ids()) k`)
    if (r.ok && r.rows[0].k > best) { best = r.rows[0].k; montor = m.id }
  }

  // 1. Indbakke (getIncomingEmails / getIncomingEmailStats) — admin har inbox.view
  const total = await n(`SELECT count(*)::int n FROM incoming_emails`)
  const list = await probe(adm, `SELECT id, subject, sender_email, received_at, link_status, customer_id, is_read, has_attachments FROM incoming_emails
    WHERE is_archived = false ORDER BY received_at DESC LIMIT 50`)
  res.push(['indbakke-liste (admin): rækker uden fejl', list.ok && list.rows.length > 0, list.ok ? `${list.rows.length} rækker` : list.code])
  const all = await probe(adm, `SELECT count(*)::int n, count(*) FILTER (WHERE customer_id IS NULL)::int u, count(*) FILTER (WHERE is_read = false)::int r FROM incoming_emails`)
  res.push(['indbakke-tællinger (admin): alle mails inkl. ukoblede', all.ok && all.rows[0].n === total && all.rows[0].u > 0, all.ok ? `${all.rows[0].n}/${total}, ukoblede ${all.rows[0].u}` : all.code])
  if (montor) {
    const m = await probe(montor, `SELECT count(*)::int n FROM incoming_emails WHERE customer_id IS NULL AND service_case_id IS NULL`)
    res.push(['indbakke (montør): ser ingen ukoblede mails', m.ok && m.rows[0].n === 0, m.ok ? `${m.rows[0].n}` : m.code])
  }

  // 2. Kundekortets mails (getCustomerMailbox) — kunden med flest koblede mails
  const top = (await run(`SELECT customer_id::text c, count(*)::int n FROM incoming_emails WHERE customer_id IS NOT NULL AND is_archived = false
    GROUP BY customer_id ORDER BY count(*) DESC, customer_id LIMIT 1`))[0]
  if (top) {
    const c = await probe(adm, `SELECT id, subject, sender_email, received_at, is_read, has_attachments, link_status FROM incoming_emails
      WHERE customer_id = '${uuid(top.c)}' AND is_archived = false ORDER BY received_at DESC LIMIT 200`)
    res.push(['kundekort-mails (admin): alle koblede mails på kunden', c.ok && c.rows.length === Math.min(top.n, 200), c.ok ? `${c.rows.length}/${top.n}` : c.code])
    const body = await probe(adm, `SELECT id, body_html, body_text, attachment_urls FROM incoming_emails WHERE customer_id = '${uuid(top.c)}' LIMIT 1`)
    res.push(['kundekort-mail-indhold (admin): getCustomerEmailBody-kolonner', body.ok && body.rows.length === 1, body.ok ? '' : body.code])
    if (montor) {
      const m = await probe(montor, `SELECT count(*)::int n FROM incoming_emails WHERE customer_id = '${uuid(top.c)}'`)
      res.push(['kundekort-mails (montør, ingen customers.emails.view): 0', m.ok && m.rows[0].n === 0, m.ok ? `${m.rows[0].n}` : m.code])
    }
  }

  // 3. Sagens/ordrens Mails-fane (getEmailsForCase / getCaseEmailDetail)
  const caseMails = await n(`SELECT count(*)::int n FROM incoming_emails WHERE service_case_id IS NOT NULL`)
  if (montor) {
    const sc = await probe(montor, `SELECT unnest(public.my_case_scope_ids())::text id`)
    const caseId = sc.ok ? sc.rows[0]?.id : undefined
    if (caseId) {
      const want = await n(`SELECT count(*)::int n FROM incoming_emails WHERE service_case_id = '${uuid(caseId)}' AND is_archived = false`)
      const t = await probe(montor, `SELECT id, subject, sender_email, received_at, is_read, has_attachments, conversation_id FROM incoming_emails
        WHERE service_case_id = '${uuid(caseId)}' AND is_archived = false ORDER BY received_at DESC LIMIT 200`)
      res.push(['sags-Mails-fane (montør, egen sag): uden fejl, alle sagens mails', t.ok && t.rows.length === want, t.ok ? `${t.rows.length}/${want}` : t.code])
    }
    const a = await probe(adm, `SELECT count(*)::int n FROM incoming_emails WHERE service_case_id IS NOT NULL`)
    res.push(['sags-mails (admin): alle', a.ok && a.rows[0].n === caseMails, a.ok ? `${a.rows[0].n}/${caseMails}` : a.code])
  }
  console.log(`INFO  sags-koblede mails i prod: ${caseMails} (fanen er dækket af rollback-prøvens fixture når 0)`)

  // 4. Leverandørfakturaers kilde-mail (notInvoiceFlagger / senderOf)
  const src = await n(`SELECT count(*)::int n FROM incoming_invoices ii JOIN incoming_emails e ON e.id = ii.source_email_id`)
  const inv = await probe(adm, `SELECT ii.id, e.sender_email FROM incoming_invoices ii JOIN incoming_emails e ON e.id = ii.source_email_id`)
  res.push(['faktura-kilde-mails (admin): afsender for alle fakturaer med kilde', inv.ok && inv.rows.length === src, inv.ok ? `${inv.rows.length}/${src}` : inv.code])

  // 5. Ingen udgående rækker / eksterne handlinger siden --since
  const tables = await run(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='created_at'
    AND table_name ILIKE ANY (ARRAY['%economic%','%sms%','%outbox%','%webhook%','%telephony%','%sent_email%','%email_log%','email_messages','email_events','sent_quotes'])
    ORDER BY 1`)
  const fresh: string[] = []
  for (const t of tables) {
    const c = await n(`SELECT count(*)::int n FROM public."${String(t.table_name).replace(/"/g, '')}" WHERE created_at >= '${since}'::timestamptz`)
    if (c > 0) fresh.push(`${t.table_name}=${c}`)
  }
  res.push([`ingen udgående rækker i ${tables.length} mail-/e-conomic-/SMS-/webhook-/udbakketabeller siden ${since}`, fresh.length === 0, fresh.join(', ')])
  const tel = await run(`SELECT to_regclass('public.telephony_events')::text AS t, to_regclass('public.telephony_calls')::text AS c`)
  res.push(['ingen telefoni-tabeller (forslag ikke anvendt)', tel[0].t === null && tel[0].c === null, ''])

  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r)` : `✅ ${res.length} smoke-tjek som forventet — read-only`)
  process.exitCode = bad ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
