/**
 * 00250 (kommunikations-hub fase 3A) — PRODUCTION READ ONLY (én READ ONLY-transaktion, prod-readonly.ts). Intet apply.
 *   npx tsx scripts/prod-00250-preflight.ts pre  [--save <fil>]
 *   npx tsx scripts/prod-00250-preflight.ts post [--pre <fil>]
 * pre:  00249 anvendt og dormant (0 rækker), INGEN 00250-objekter, forudsætninger (kolonner 00250 læser), tællinger,
 *       data- og struktur-fingeraftryk (--save gemmer dem til sammenligning efter dry-run/prod)
 * post: 00250 anvendt som forventet (3 tabeller m. RLS, 6 nye funktioner, 2 triggere, ACL, ingen anon/PUBLIC, katalog
 *       uændret), 0 rækker i de nye tabeller og 0 henvendelser, data-fingeraftryk = pre (--pre)
 * Ingen personværdier ud — kun antal, md5 og strukturtjek.
 */
import { readFileSync, writeFileSync } from 'fs'
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { STRUCT_MD5 } from './test-harness/reception-00249-probe'
import { FP_00250, FP_00250_SQL, T250, F250, TRG250, COLS250, F_REPLACED } from './prod-00250-preflight-shared'

const mode = process.argv[2] === 'post' ? 'post' : 'pre'
const argOf = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }

withProdReadOnly(`prod-00250-preflight ${mode}`, async (run) => {
  const res: Array<[string, boolean, string]> = []
  const cat = (await run(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p`))[0]
  console.log(`INFO  katalog: ${cat.k} nøgler / ${cat.p} rollestandarder`)
  const fp = (await run(FP_00250_SQL))[0]
  for (const [t] of FP_00250) console.log(`INFO  fp ${t}: ${fp[t]}`)
  const struct = (await run(`SELECT ${STRUCT_MD5} s`))[0].s
  console.log(`INFO  struktur-md5 (public): ${struct}`)
  const c = (await run(`SELECT
    (SELECT count(*)::int FROM incoming_emails) mails,
    (SELECT count(*)::int FROM incoming_emails WHERE created_at IS NULL) mails_no_discovery,
    (SELECT count(*)::int FROM incoming_emails WHERE conversation_id IS NOT NULL) mails_with_graph_thread,
    (SELECT count(*)::int FROM incoming_emails WHERE customer_id IS NOT NULL AND linked_by = 'manual') mails_manual,
    (SELECT count(*)::int FROM incoming_emails WHERE link_status::text = 'pending' AND processed_at IS NULL AND created_at >= now() - interval '14 days') mails_pending_retry_14d,
    (SELECT count(*)::int FROM portal_messages WHERE sender_type = 'customer') portal_customer,
    (SELECT count(*)::int FROM portal_messages WHERE sender_type = 'customer' AND offer_id IS NOT NULL) portal_with_offer,
    (SELECT count(*)::int FROM conversations) conversations, (SELECT count(*)::int FROM conversation_items) items,
    (SELECT count(*)::int FROM telephony_calls) calls`))[0]
  console.log(`INFO  tællinger: ${JSON.stringify(c)}`)

  // 00249 skal være anvendt og dormant (00250's guard-blok kræver 00249)
  const t249 = (await run(`SELECT count(*)::int n FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('conversations','conversation_items','conversation_actions','upload_requests') AND relkind = 'r'`))[0].n
  res.push(['00249 anvendt (4 tabeller) og katalog 120/291', t249 === 4 && cat.k === 120 && cat.p === 291, `${t249} · ${cat.k}/${cat.p}`])
  const pre = (await run(`SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='incoming_emails' AND column_name='created_at') a,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='incoming_emails' AND column_name='conversation_id') b,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='incoming_emails' AND column_name='attachment_urls') c,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='incoming_emails' AND column_name='linked_by') d,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='portal_messages' AND column_name='offer_id') e,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='portal_messages' AND column_name='attachments') f,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_cases' AND column_name='source_offer_id') g,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='service_cases' AND column_name='is_proposal') h,
    to_regprocedure('public.reception_ingest(jsonb)') IS NOT NULL i, to_regclass('public.customer_documents') IS NOT NULL j`))[0]
  res.push(['forudsætninger: kolonner 00250 læser (created_at, conversation_id, attachment_urls, linked_by, offer_id, attachments, source_offer_id, is_proposal), reception_ingest', Object.values(pre).every(Boolean), JSON.stringify(pre)])
  res.push(['mail: alle rækker har opdaget-tid (created_at) — grundlaget for "ny mail" efter udfald', c.mails_no_discovery === 0, `${c.mails_no_discovery}`])

  const cols = await run(`SELECT table_name || '.' || column_name c FROM information_schema.columns WHERE table_schema='public' AND (table_name, column_name) IN ${COLS250} ORDER BY 1`)
  const tabs = await run(`SELECT relname || ':' || relrowsecurity t FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ${T250} AND relkind='r' ORDER BY 1`)
  const fns = await run(`SELECT proname f FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ${F250} ORDER BY 1`)
  const trg = await run(`SELECT tgname || ':' || tgenabled::text t FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ${TRG250} ORDER BY 1`)
  const st = (await run(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'conversations_status_check'`))[0]?.d as string ?? ''
  // Eksisterende henvendelser (2026-11-18: 32 fra ét manuelt "Hent nye"-tryk af en admin — final review S2-B1). 00250 skal
  // tåle dem: ingen baggrundsindtag, intet udført, og kilde/henvendelse er enige (ellers afstemmes de efter anvendelse).
  const ex0 = (await run(`SELECT
    (SELECT count(*)::int FROM conversations WHERE intake_actor <> 'user') bg,
    (SELECT count(*)::int FROM conversation_actions WHERE state IN ('approved','executed')) done,
    (SELECT count(*)::int FROM conversation_items i JOIN conversations cv ON cv.id = i.conversation_id JOIN incoming_emails e ON i.source_table = 'incoming_emails' AND e.id = i.source_id
      WHERE e.linked_by = 'manual' AND e.customer_id IS NOT NULL AND cv.customer_id IS DISTINCT FROM e.customer_id) conflicts,
    (SELECT count(*)::int FROM conversation_items i WHERE i.source_id IS NOT NULL AND i.source_table = 'incoming_emails' AND NOT EXISTS (SELECT 1 FROM incoming_emails e WHERE e.id = i.source_id)) orphans`))[0]
  console.log(`INFO  eksisterende henvendelser: ${c.conversations} (baggrund ${ex0.bg}, godkendt/udført ${ex0.done}, kilde-konflikter ${ex0.conflicts}, forældreløse ${ex0.orphans})`)
  res.push(['eksisterende henvendelser: ingen baggrundsindtag og intet godkendt/udført (kun medarbejder-indtag som forslag)', ex0.bg === 0 && ex0.done === 0, `${ex0.bg}/${ex0.done}`])
  res.push(['eksisterende henvendelser: kilde og henvendelse enige (0 manuelle koblinger til anden kunde) — ellers afstemningstrin efter anvendelse', ex0.conflicts === 0, `${ex0.conflicts}`])
  if (mode === 'pre') {
    res.push(['ingen 00250-kolonner', cols.length === 0, cols.map((x) => x.c).join(',')])
    res.push(['ingen 00250-tabeller (web_chat_*)', tabs.length === 0, tabs.map((x) => x.t).join(',')])
    res.push(['ingen 00250-funktioner', fns.length === 0, fns.map((x) => x.f).join(',')])
    res.push(['ingen 00250-triggere (inkl. trg_incoming_emails_reception_reconcile)', trg.length === 0, trg.map((x) => x.t).join(',')])
    res.push(["status-check uden 'awaiting_elta' (00249-form)", st.length > 0 && !st.includes('awaiting_elta'), ''])
    res.push(['genforsøg af ubehandlede mails: 0 inden for 14 dage (ingen AI-burst ved deploy af den rettede genforsøgs-forespørgsel)', c.mails_pending_retry_14d === 0, `${c.mails_pending_retry_14d}`])
    const g = (await run(`SELECT current_setting('reception.reconcile', true) a, current_setting('reception.retention', true) b`))[0]
    res.push(['GUC reception.reconcile/retention ikke sat', !g.a && !g.b, ''])
  } else {
    res.push(['7 nye kolonner', cols.length === 7, cols.map((x) => x.c).join(',')])
    res.push(['3 tabeller med RLS', tabs.map((x) => x.t).join(',') === 'web_chat_messages:true,web_chat_rate_limits:true,web_chat_sessions:true', tabs.map((x) => x.t).join(',')])
    res.push(['6 nye funktioner', fns.length === 6, fns.map((x) => x.f).join(',')])
    res.push(['2 triggere, slået til', trg.map((x) => x.t).join(',') === 'trg_conversation_items_update_guard:O,trg_incoming_emails_reception_reconcile:O', trg.map((x) => x.t).join(',')])
    res.push(["status-check med 'awaiting_elta'", st.includes('awaiting_elta'), ''])
    const ex = await run(`SELECT p.proname n, p.prosecdef d, array_to_string(p.proconfig, ',') cfg, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u, has_function_privilege('service_role', p.oid, 'EXECUTE') s
      FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname IN ${F250} OR p.proname IN ${F_REPLACED}) ORDER BY 1`)
    const sig = ex.map((x) => `${x.n}:${x.a ? 'A' : '-'}${x.u ? 'U' : '-'}${x.s ? 'S' : '-'}`).join(',')
    const svc = new Set(ex.filter((x) => x.s).map((x) => x.n as string))
    res.push(['EXECUTE: anon intet; authenticated kun reception_ingest; service_role har ingest/reconcile/retention/rate_check men IKKE reception_detach_item', ex.every((x) => !x.a)
      && ex.filter((x) => x.u).map((x) => x.n).join(',') === 'reception_ingest'
      && ['reception_ingest', 'reception_reconcile_source', 'reception_retention', 'web_chat_rate_check'].every((n) => svc.has(n)) && !svc.has('reception_detach_item'), sig])
    res.push(['alle SECURITY DEFINER-funktioner har fast search_path', ex.filter((x) => x.d).every((x) => /search_path=public/.test(String(x.cfg))), ex.filter((x) => x.d).map((x) => x.n).join(',')])
    const g = await run(`SELECT table_name || ':' || grantee || ':' || privilege_type g FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ${T250} AND grantee IN ('anon','PUBLIC','authenticated','service_role') ORDER BY 1`)
    const gs = g.map((x) => x.g)
    res.push(['grants: anon/PUBLIC intet; authenticated kun SELECT web_chat_messages; web_chat_rate_limits ingen API-rolle',
      !gs.some((x) => /:(anon|PUBLIC):/.test(x)) && gs.filter((x) => x.includes(':authenticated:')).join(',') === 'web_chat_messages:authenticated:SELECT' && !gs.some((x) => x.startsWith('web_chat_rate_limits:')), gs.filter((x) => !x.includes(':service_role:')).join(',')])
    const tok = (await run(`SELECT has_column_privilege('authenticated','public.web_chat_sessions','token_hash','SELECT') t, has_column_privilege('authenticated','public.web_chat_sessions','visitor_name','SELECT') v`))[0]
    res.push(['web_chat_sessions.token_hash ulæselig for authenticated (besøgsfelter via synlig henvendelse)', tok.t === false && tok.v === true, ''])
    const rows = (await run(`SELECT (SELECT count(*) FROM web_chat_sessions)::int a, (SELECT count(*) FROM web_chat_messages)::int b, (SELECT count(*) FROM web_chat_rate_limits)::int c`))[0]
    res.push(['0 rækker i web_chat_* (chat FRA)', rows.a + rows.b + rows.c === 0, JSON.stringify(rows)])
    const preFile0 = argOf('--pre')
    const preCount = preFile0 ? (JSON.parse(readFileSync(preFile0, 'utf8')) as { counts: { conversations: number } }).counts.conversations : null
    res.push(['ingen nye henvendelser siden pre (alle indtag FRA)', preCount === null ? true : c.conversations === preCount, `${c.conversations} (pre ${preCount ?? 'ukendt — giv --pre'})`])
    res.push(['katalog uændret 120/291 (00250 tilføjer ingen nøgler)', cat.k === 120 && cat.p === 291, `${cat.k}/${cat.p}`])
    const preFile = argOf('--pre')
    if (preFile) {
      const before = JSON.parse(readFileSync(preFile, 'utf8')) as { fp: Record<string, string> }
      const changed = FP_00250.map(([t]) => t).filter((t) => before.fp[t] !== fp[t])
      res.push(['data-fingeraftryk = pre (ingen eksisterende rækker omskrevet; ændringer siden pre skyldes normal drift — vurdér listen)', changed.length === 0, changed.join(',') || 'alle = pre'])
    }
  }
  const save = argOf('--save')
  if (save) { writeFileSync(save, JSON.stringify({ catalog: cat, fp, struct, counts: c }, null, 2)); console.log(`INFO  gemt: ${save}`) }
  for (const [id, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${note ? ` — ${note}` : ''}`)
  process.exitCode = res.some((r) => !r[1]) ? 2 : 0
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
