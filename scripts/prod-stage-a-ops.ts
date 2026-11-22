/**
 * Stage A — løbende drift: kommunikations-hub-sundhed + mail→henvendelse-overvågning. PRODUCTION READ ONLY
 * (prod-readonly.ts: én READ ONLY-transaktion, kun SELECT). Kun antal, kategorier og UUID'er — aldrig emne, afsender,
 * navne eller indhold. Afløser 00250-dormancy-tjekket ("0 nye henvendelser"), som ikke længere gælder efter Stage A.
 *   npx tsx scripts/prod-stage-a-ops.ts [--since 2026-11-22T06:17:00Z] [--retry-min 15]
 *
 * FORVENTET: henvendelser fra egnede indgående mails opdaget efter aktivering (inkl. webformular-mails, som får
 *   kanalen web_chat, men kommer fra incoming_emails).
 * KRITISK (exit 2): udførte/godkendte handlinger · automatisk udgående (SMS/opkald/handling med send) · dublet-kilde/-item
 *   eller dublet Graph-id · tvær-kunde-tråd · egnet mail uden item efter retry-vinduet · historisk mail indtaget ·
 *   indtag fra web-chat/portal/SMS/telefon/upload · retention/backfill/baggrunds-udførelse · kandidat-kunde eller
 *   sags-kandidat gjort bekræftet uden manuel kobling · item tilføjet en håndteret henvendelse · manuel kobling
 *   overtrumfet · de oprindelige 32 ændret uden menneskelig handling.
 * ADVARSEL (exit 0, vises): sync-pauser > 12 min, sync-fejl, læsefejl/fejl i indtags-tællere, mails der venter på mail-sync.
 * Menneskelig CRM-kommunikation (medarbejderes svar i portal, mails sendt fra Outlook/CRM) er IKKE en Stage A-fejl og
 * vises særskilt.
 */
import { readFileSync } from 'fs'
import { withProdReadOnly, maskDbError } from './prod-readonly'

const argOf = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const ACTIVATION = '2026-11-22T06:17:00Z'
const since = new Date(argOf('--since') ?? ACTIVATION).toISOString()
const retryMin = Math.max(10, Number(argOf('--retry-min') ?? 15))
const BASELINE = JSON.parse(readFileSync('scripts/data/stage-a-baseline-2026-11-22.json', 'utf8')) as {
  agg: { conv: number; items: number; actions: number; actions_md5: string; action_states: string }; convs: Array<{ id: string; h: string }>
}
const uuidList = (ids: string[]) => ids.map((x) => `'${x.replace(/[^0-9a-f-]/gi, '')}'`).join(',') || "'00000000-0000-0000-0000-000000000000'"
const B = uuidList(BASELINE.convs.map((c) => c.id))
const OWN = `(e.sender_email ILIKE '%@eltasolar.dk')`

withProdReadOnly('prod-stage-a-ops', async (run) => {
  const crit: Array<[string, boolean, string]> = []
  const warn: Array<[string, boolean, string]> = []
  const one = async (sql: string) => (await run(sql))[0]

  // ── 1. Mails opdaget efter aktivering → items/henvendelser ──
  const mails = await run(`SELECT e.id::text id, e.link_status::text ls, ${OWN} own, e.created_at < now() - interval '${retryMin} minutes' AS past_retry,
      e.linked_by, e.customer_id::text mcust, e.service_case_id::text mcase, e.conversation_id IS NOT NULL has_graph_thread, md5(coalesce(e.conversation_id, '')) gthread,
      lower(e.sender_email) sender,
      (SELECT count(*)::int FROM conversation_items i WHERE i.source_table = 'incoming_emails' AND i.source_id = e.id) n_items,
      (SELECT i.conversation_id::text FROM conversation_items i WHERE i.source_table = 'incoming_emails' AND i.source_id = e.id ORDER BY i.created_at LIMIT 1) conv_id,
      (SELECT i.created_at::text FROM conversation_items i WHERE i.source_table = 'incoming_emails' AND i.source_id = e.id ORDER BY i.created_at LIMIT 1) item_at
    FROM incoming_emails e WHERE e.created_at >= '${since}'::timestamptz ORDER BY e.created_at`)
  const inbound = mails.filter((m) => !m.own)
  const eligible = inbound.filter((m) => m.ls !== 'ignored' && m.ls !== 'pending')
  const convIds = [...new Set(mails.map((m) => m.conv_id).filter(Boolean))] as string[]
  const convs = convIds.length ? await run(`SELECT c.id::text id, c.channel, c.status, c.urgency, c.customer_match_state cm, c.case_match_state sm, c.customer_id::text cust,
      c.customer_candidate_id::text cand, c.service_case_id::text scase, c.case_candidate_id::text ccand, c.intake_actor, c.thread_key, c.handled_at,
      (c.created_at >= '${since}'::timestamptz) is_new, (SELECT count(*)::int FROM conversation_items i WHERE i.conversation_id = c.id) items
    FROM conversations c WHERE c.id IN (${uuidList(convIds)})`) : []
  const cById = new Map(convs.map((c) => [c.id as string, c]))
  const newConvs = convs.filter((c) => c.is_new)
  // created vs appended: item i en henvendelse oprettet efter aktivering, som er dens første item = created; ellers appended
  const firstItemOf = new Map<string, string>()
  for (const m of mails) if (m.conv_id && m.item_at && (!firstItemOf.has(m.conv_id) || m.item_at < (firstItemOf.get(m.conv_id) as string))) firstItemOf.set(m.conv_id, m.item_at)
  let created = 0, appended = 0
  for (const m of mails) if (m.conv_id) { const c = cById.get(m.conv_id); if (c?.is_new && firstItemOf.get(m.conv_id) === m.item_at) created++; else appended++ }
  const cnt = (f: (c: Record<string, any>) => boolean) => newConvs.filter(f).length
  const counts = {
    inbound_mails: inbound.length, eligible_mails: eligible.length, own_elta_mail: mails.filter((m) => m.own).length,
    ignored_system: inbound.filter((m) => m.ls === 'ignored').length, waiting_for_mail_sync: inbound.filter((m) => m.ls === 'pending').length,
    created_henvendelser: created, appended_items: appended,
    unmatched: cnt((c) => c.cm === 'no_match' || c.cm === 'insufficient_information'), candidate_customer: cnt((c) => !c.cust && !!c.cand && c.cm === 'unique_match'),
    confirmed_customer: cnt((c) => !!c.cust), ambiguous: cnt((c) => c.cm === 'ambiguous'), identity_read_error: cnt((c) => c.cm === 'read_error'),
    case_candidate: cnt((c) => !c.scase && c.sm === 'exact'), case_several_open: cnt((c) => c.sm === 'several_open'), confirmed_case: cnt((c) => !!c.scase), case_read_error: cnt((c) => c.sm === 'read_error'),
  }
  const acts = (await run(`SELECT state, count(*)::int n FROM conversation_actions WHERE conversation_id IN (${uuidList(newConvs.map((c) => c.id))}) GROUP BY 1`))
  const actBy = Object.fromEntries(acts.map((a) => [a.state, a.n]))
  // indtags-tællere fra mail-sync (reception-sundhed pr. kørsel) — sweep_* = afstemnings-genforsøg
  const rec = await run(`SELECT status, metadata->'counts' c FROM system_health_log WHERE service = 'reception' AND created_at >= '${since}'::timestamptz`)
  const agg: Record<string, number> = {}
  for (const r of rec) for (const [k, v] of Object.entries((r.c ?? {}) as Record<string, number>)) agg[k] = (agg[k] ?? 0) + Number(v)
  const procErrors = Object.entries(agg).filter(([k]) => /(^|_)(error|read_error|not_found)$/.test(k)).reduce((a, [, v]) => a + v, 0)
  const retries = Object.entries(agg).filter(([k]) => k.startsWith('sweep')).reduce((a, [, v]) => a + v, 0)
  console.log(`INFO  siden ${since}: ${JSON.stringify(counts)}`)
  console.log(`INFO  handlinger (nye henvendelser): proposed=${actBy.proposed ?? 0} blocked=${actBy.blocked ?? 0} executed/approved=${(actBy.executed ?? 0) + (actBy.approved ?? 0)}`)
  console.log(`INFO  indtags-tællere (sum af kørsler): ${JSON.stringify(agg)} · behandlingsfejl ${procErrors} · afstemnings-genforsøg ${retries}`)

  // ── 2. Kritiske integritets-/sikkerhedstjek ──
  const dupItems = (await one(`SELECT count(*)::int n FROM (SELECT source_table, source_id FROM conversation_items WHERE source_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1) d`)).n
  const dupGraph = (await one(`SELECT count(*)::int n FROM (SELECT graph_message_id FROM incoming_emails WHERE graph_message_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d`)).n
  crit.push(['ingen kilde har mere end ét item; ingen dublet Graph-id', dupItems === 0 && dupGraph === 0, `items ${dupItems} · graph ${dupGraph}`])
  const lost = eligible.filter((m) => m.n_items === 0 && m.past_retry)
  crit.push([`hver egnet mail har et item efter retry-vinduet (${retryMin} min)`, lost.length === 0, `${lost.length} uden item`])
  crit.push(['egne ELTA-mails (inkl. sendte) bliver aldrig til henvendelser', mails.filter((m) => m.own).every((m) => m.n_items === 0), ''])
  const hist = (await one(`SELECT count(*)::int n FROM conversation_items i JOIN incoming_emails e ON i.source_table = 'incoming_emails' AND e.id = i.source_id
    WHERE i.created_at >= '${since}'::timestamptz AND e.created_at < '${since}'::timestamptz`)).n
  crit.push(['ingen historisk mail (opdaget før aktivering) indtaget efter aktivering', hist === 0, `${hist}`])
  const exec = (await one(`SELECT count(*)::int n FROM conversation_actions WHERE state IN ('approved', 'executed') OR executed_ref IS NOT NULL`)).n
  crit.push(['0 godkendte/udførte handlinger i hele hub\'en (Stage A foreslår kun)', exec === 0, `${exec}`])
  const otherIntake = await one(`SELECT
    (SELECT count(*)::int FROM conversation_items WHERE created_at >= '${since}'::timestamptz AND coalesce(source_table, '') <> 'incoming_emails') non_mail_items,
    (SELECT count(*)::int FROM web_chat_sessions) wc_s, (SELECT count(*)::int FROM web_chat_messages) wc_m, (SELECT count(*)::int FROM web_chat_rate_limits) wc_rl,
    (SELECT count(*)::int FROM upload_requests WHERE created_at >= '${since}'::timestamptz) uploads,
    (SELECT count(*)::int FROM conversations WHERE created_at >= '${since}'::timestamptz AND intake_actor <> 'ai_receptionist') non_bg_convs,
    (SELECT count(*)::int FROM audit_logs WHERE created_at >= '${since}'::timestamptz AND action IN ('reception_retention_applied')) retention,
    (SELECT count(*)::int FROM conversations WHERE text_purged_at IS NOT NULL OR customer_deleted_at IS NOT NULL OR case_deleted_at IS NOT NULL) purged`)
  crit.push(['ingen indtag fra web-chat/portal/SMS/telefon/upload (kun incoming_emails-items)', otherIntake.non_mail_items === 0 && otherIntake.wc_s + otherIntake.wc_m + otherIntake.wc_rl === 0 && otherIntake.uploads === 0, JSON.stringify({ items: otherIntake.non_mail_items, webchat: otherIntake.wc_s + otherIntake.wc_m + otherIntake.wc_rl, uploads: otherIntake.uploads })])
  crit.push(['ingen backfill ("Hent nye"/medarbejder-indtag) og ingen retention siden aktivering', otherIntake.non_bg_convs === 0 && otherIntake.retention === 0 && otherIntake.purged === 0, JSON.stringify({ medarbejder_indtag: otherIntake.non_bg_convs, retention: otherIntake.retention, purged: otherIntake.purged })])
  const out = await one(`SELECT (SELECT count(*)::int FROM sms_messages WHERE created_at >= '${since}'::timestamptz) sms,
    (SELECT count(*)::int FROM telephony_calls WHERE created_at >= '${since}'::timestamptz) calls, (SELECT count(*)::int FROM telephony_events WHERE received_at >= '${since}'::timestamptz) tel_events,
    (SELECT count(*)::int FROM portal_messages WHERE created_at >= '${since}'::timestamptz AND sender_type <> 'customer' AND sender_id IS NULL) portal_auto,
    (SELECT count(*)::int FROM portal_messages WHERE created_at >= '${since}'::timestamptz AND sender_type <> 'customer' AND sender_id IS NOT NULL) portal_human,
    (SELECT count(*)::int FROM incoming_emails e WHERE e.created_at >= '${since}'::timestamptz AND ${OWN}) own_sent_or_internal`)
  crit.push(['automatisk udgående = 0: SMS 0, opkald/telefoni 0, automatiske portal-svar 0, udførte handlinger 0', out.sms === 0 && out.calls === 0 && out.tel_events === 0 && out.portal_auto <= 0 && exec === 0, JSON.stringify({ sms: out.sms, calls: out.calls, tel: out.tel_events, portal_auto: out.portal_auto })])
  console.log(`INFO  menneskelig CRM-kommunikation siden aktivering (ikke Stage A): portal-svar fra medarbejdere ${out.portal_human} · egne/sendte ELTA-mails synket ${out.own_sent_or_internal}`)
  // tråde / kunder / sager
  const multi = newConvs.filter((c) => c.items > 1)
  const threadMismatch = mails.filter((m) => m.conv_id && m.has_graph_thread && cById.get(m.conv_id)?.thread_key && cById.get(m.conv_id)?.thread_key !== `mail-thread:${m.gthread}`)
  crit.push(['svar ligger i den korrekte Microsoft-tråd (henvendelsens tråd = mailens Graph-tråd)', threadMismatch.length === 0, `${threadMismatch.length} afvigende`])
  const sendersPerConv = new Map<string, Set<string>>()
  const threadsPerConv = new Map<string, Set<string>>()
  for (const m of mails) if (m.conv_id) { (sendersPerConv.get(m.conv_id) ?? sendersPerConv.set(m.conv_id, new Set()).get(m.conv_id)!).add(m.sender); (threadsPerConv.get(m.conv_id) ?? threadsPerConv.set(m.conv_id, new Set()).get(m.conv_id)!).add(m.gthread) }
  const mixedThreads = [...threadsPerConv.values()].filter((s) => s.size > 1).length
  crit.push(['urelaterede mails (forskellige Graph-tråde) flettes aldrig i samme henvendelse', mixedThreads === 0, `${mixedThreads}`])
  const crossCust = (await one(`SELECT count(*)::int n FROM conversations c WHERE c.created_at >= '${since}'::timestamptz AND c.customer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM conversation_items i JOIN incoming_emails e ON i.source_table = 'incoming_emails' AND e.id = i.source_id
      WHERE i.conversation_id = c.id AND e.linked_by = 'manual' AND e.customer_id IS NOT NULL AND e.customer_id <> c.customer_id)`)).n
  crit.push(['ingen tvær-kunde-tråd: en henvendelses bekræftede kunde modsiger aldrig en manuelt koblet kildemail', crossCust === 0, `${crossCust}`])
  const autoConfirmed = newConvs.filter((c) => c.cust && !mails.some((m) => m.conv_id === c.id && m.linked_by === 'manual' && m.mcust === c.cust))
  crit.push(['kandidat-kunder bliver aldrig bekræftet automatisk (bekræftet kun via manuel kobling)', autoConfirmed.length === 0, `${autoConfirmed.length}`])
  const autoCase = newConvs.filter((c) => c.scase && !mails.some((m) => m.conv_id === c.id && m.linked_by === 'manual' && m.mcase === c.scase))
  crit.push(['sags-kandidater bliver aldrig til tilknyttede sager automatisk', autoCase.length === 0, `${autoCase.length}`])
  const manualOverridden = mails.filter((m) => m.conv_id && m.linked_by === 'manual' && m.mcust && cById.get(m.conv_id)?.cust && cById.get(m.conv_id)?.cust !== m.mcust)
  crit.push(['manuelle koblinger går forud for automatik (henvendelsens kunde = manuelt koblet kunde)', manualOverridden.length === 0, `${manualOverridden.length}`])
  const reopened = (await one(`SELECT count(*)::int n FROM conversations c WHERE c.handled_at IS NOT NULL AND EXISTS (
      SELECT 1 FROM conversation_items i WHERE i.conversation_id = c.id AND i.created_at > c.handled_at AND i.created_at >= '${since}'::timestamptz)`)).n
  crit.push(['håndterede henvendelser genåbnes ikke i stilhed (intet item tilføjet efter håndtering)', reopened === 0, `${reopened}`])
  console.log(`INFO  tråde: ${multi.length} henvendelser med flere items · afsendere pr. henvendelse >1: ${[...sendersPerConv.values()].filter((s) => s.size > 1).length}`)

  // ── 3. De oprindelige 32 (aktiverings-baseline) ──
  const now32 = await run(`SELECT id::text, md5((to_jsonb(x) - 'thread_key' - 'text_purged_at' - 'customer_deleted_at' - 'case_deleted_at')::text) h, (handled_by IS NOT NULL OR updated_at > '${since}'::timestamptz) touched FROM public.conversations x WHERE id IN (${B})`)
  const hm = new Map(now32.map((r) => [r.id as string, r]))
  const changed32 = BASELINE.convs.filter((c) => hm.get(c.id)?.h !== c.h)
  const a32 = (await one(`SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) m, count(*)::int n FROM conversation_actions x WHERE conversation_id IN (${B})`))
  const human32 = (await one(`SELECT count(*)::int n FROM audit_logs WHERE created_at >= '${since}'::timestamptz AND entity_type = 'conversation' AND entity_id::text IN (${B}) AND user_id IS NOT NULL`)).n
  const items32 = (await one(`SELECT count(*)::int n FROM conversation_items WHERE conversation_id IN (${B})`)).n
  const ok32 = (changed32.length === 0 && a32.m === BASELINE.agg.actions_md5 && items32 === BASELINE.agg.items) || (human32 > 0)
  crit.push([`de oprindelige ${BASELINE.convs.length} henvendelser: uændrede (kunde/sag/status/forslag/items) — medmindre en medarbejder har behandlet dem`, ok32, `${changed32.length} ændret · items ${items32}/${BASELINE.agg.items} · handlinger ${a32.n}/${BASELINE.agg.actions}${human32 > 0 ? ` · ${human32} menneskelige handlinger` : ''}`])
  const tot = await one(`SELECT (SELECT count(*)::int FROM conversations) c, (SELECT count(*)::int FROM conversation_items) i, (SELECT count(*)::int FROM conversation_actions) a`)
  console.log(`INFO  i alt nu: ${tot.c} henvendelser / ${tot.i} items / ${tot.a} handlinger (før aktivering ${BASELINE.agg.conv}/${BASELINE.agg.items}/${BASELINE.agg.actions}; første Stage A-resultat 33/33/71)`)

  // ── 4. Mail-sync-kadence og lease ──
  const runs = await run(`SELECT created_at, status, (metadata->>'duration_ms')::int ms, (metadata->>'summary') LIKE '%already_running%' skipped, (metadata->>'summary') LIKE '%lease_error%' lease_err
    FROM system_health_log WHERE service = 'cron' AND metadata->>'cron' = 'email-sync' AND created_at >= '${since}'::timestamptz ORDER BY created_at`)
  const gaps = runs.slice(1).map((r, i) => (new Date(r.created_at).getTime() - new Date(runs[i].created_at).getTime()) / 60000)
  const durs = runs.map((r) => r.ms).filter((x) => typeof x === 'number').sort((a, b) => a - b)
  const last = runs[runs.length - 1]
  const lease = await one(`SELECT count(*)::int n, count(*) FILTER (WHERE expires_at < now())::int expired FROM public.sync_leases`)
  const sinceLast = last ? (Date.now() - new Date(last.created_at).getTime()) / 60000 : Infinity
  console.log(`INFO  mail-sync: ${runs.length} kørsler siden aktivering · seneste ${last ? new Date(last.created_at).toISOString() : '—'} (${sinceLast.toFixed(1)} min siden, ${last?.ms ?? '—'} ms) · varighed p50 ${durs[Math.floor(durs.length / 2)] ?? '—'} / max ${durs[durs.length - 1] ?? '—'} ms · already_running ${runs.filter((r) => r.skipped).length} · lease_error ${runs.filter((r) => r.lease_err).length} · fejl ${runs.filter((r) => r.status !== 'ok').length} · lease nu ${lease.n} (udløbet ${lease.expired})`)
  warn.push(['mail-sync kører hvert ~5. minut (seneste kørsel < 12 min siden, ingen pause > 12 min)', sinceLast < 12 && gaps.every((g) => g <= 12), `seneste ${sinceLast.toFixed(1)} min · største pause ${gaps.length ? Math.max(...gaps).toFixed(1) : '—'} min`])
  warn.push(['ingen mail-sync-fejl og ingen lease_error siden aktivering', runs.every((r) => r.status === 'ok') && !runs.some((r) => r.lease_err), ''])
  warn.push(['ingen udløbet lease hængende (dræbt kørsel)', lease.expired <= 0, `${lease.expired}`])
  warn.push(['ingen behandlingsfejl/læsefejl i indtaget', procErrors === 0 && counts.identity_read_error + counts.case_read_error === 0, `${procErrors}`])

  for (const [id, ok, note] of crit) console.log(`${ok ? 'PASS' : 'CRITICAL'}  ${id}${note ? ` — ${note}` : ''}`)
  for (const [id, ok, note] of warn) console.log(`${ok ? 'PASS' : 'WARN'}  ${id}${note ? ` — ${note}` : ''}`)
  const nCrit = crit.filter((c) => !c[1]).length
  console.log(nCrit ? `❌ ${nCrit} KRITISKE fund — overvej nødstop A (RECEPTION_EMAIL_INGEST_ENABLED=false + redeploy)` : `✅ Stage A drift: 0 kritiske fund · ${warn.filter((w) => !w[1]).length} advarsler`)
  process.exitCode = nCrit ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
