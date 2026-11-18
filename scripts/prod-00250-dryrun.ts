/**
 * 00250 — PRODUCTION DRY-RUN, ROLLBACK-ONLY (prod-rollback-probe.ts: ÉN transaktion, ALTID ROLLBACK, COMMIT forbudt).
 *   npx tsx scripts/prod-00250-dryrun.ts          (00249 anvendt, 00250 ikke)
 *   npx tsx scripts/prod-00250-dryrun.ts --post   (EFTER permanent anvendelse: springer krop + rollback-blok over)
 * 1. før: katalog, data-fingeraftryk, struktur-md5
 * 2. den PRÆCISE migrationskrop (supabase/migrations/00250…sql uden BEGIN/COMMIT)
 * 3. efter krop: katalog uændret, data-fingeraftryk = før (intet eksisterende omskrevet), ACL/grants/search_path
 * 4. fixtures I transaktionen (syntetiske mails/portalbeskeder/chat på eksisterende kunder — ingen nye kunder, så ingen
 *    sekvenser forbruges): tråd, kandidat-konflikt, manuel kobling → afstemning (som rigtig admin-profil via RLS), portal
 *    uden tilbud, web-chat (kun service_role), misbrugsværn, retention dry-run, personaer admin/montør/anon
 * 5. fixtures slettes → filens ROLLBACK-blok → struktur-md5, katalog og data-fingeraftryk = før
 * 6. transaktionen rulles tilbage (intet består).
 * Kun PASS/FAIL + antal/koder ud — ingen id'er, navne eller indhold.
 */
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'
import { STRUCT_MD5 } from './test-harness/reception-00249-probe'
import { migration00250Body, rollback00250Sql, NEW_TABLES_250, NEW_FUNCS_250 } from './test-harness/reception-00250-probe'
import { FP_00250, FP_00250_SQL } from './prod-00250-preflight-shared'

const POST = process.argv.includes('--post')

runMain(() => withProdRollbackProbe(POST ? '00250-post-personas' : '00250-dryrun', async ({ q, as, add }) => {
  const cat0 = (await q(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p`))[0]
  const fp0 = (await q(FP_00250_SQL))[0]
  const struct0 = (await q(`SELECT ${STRUCT_MD5} s`))[0].s as string
  const n250 = (await q(`SELECT count(*)::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ${NEW_TABLES_250}`))[0].n
  const n249 = (await q(`SELECT count(*)::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('conversations','conversation_items','conversation_actions','upload_requests')`))[0].n
  if (POST) add('NY', 'efter: 00250 er anvendt (3 tabeller), katalog 120/291', n250 === 3 && cat0.k === 120 && cat0.p === 291, `katalog ${cat0.k}/${cat0.p}`)
  else add('UÆNDRET', 'før: 00249 anvendt, 00250 ikke', n249 === 4 && n250 === 0, `katalog ${cat0.k}/${cat0.p}, struktur ${struct0.slice(0, 8)}…`)

  if (!POST) {
    const body = migration00250Body()
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body)) throw new Error('kroppen indeholder transaktionskontrol')
    try { await q(body) } catch (e) { add('NY', 'migrationskroppen kører rent', false, (e as { code?: string }).code ?? 'fejl'); return }
    add('NY', 'migrationskroppen kører rent (guard, kolonner, tabeller, funktioner, triggere, politikker, grants)', true, '')
  }
  const cat1 = (await q(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p`))[0]
  add('NY', 'katalog uændret (ingen nye nøgler/standarder)', cat1.k === cat0.k && cat1.p === cat0.p, `${cat1.k}/${cat1.p}`)
  const fp1 = (await q(FP_00250_SQL))[0]
  const changed = FP_00250.map(([t]) => t).filter((t) => fp1[t] !== fp0[t])
  add('NY', `ingen eksisterende rækker ændret (${FP_00250.length} tabeller inkl. incoming_emails/portal_messages/kunder/sager)`, changed.length === 0, changed.join(',') || 'alle = før')
  const ex = await q(`SELECT p.proname n, p.prosecdef d, array_to_string(p.proconfig, ',') c, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u, has_function_privilege('service_role', p.oid, 'EXECUTE') s
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ${NEW_FUNCS_250} ORDER BY 1`)
  add('NY', 'nye funktioner: anon/authenticated intet; detach heller ikke service_role', ex.length === 6 && ex.every((x) => !x.a && !x.u) && !ex.find((x) => x.n === 'reception_detach_item')?.s,
    ex.map((x) => `${x.n}:${x.a ? 'A' : '-'}${x.u ? 'U' : '-'}${x.s ? 'S' : '-'}`).join(' '))
  add('NY', 'SECURITY DEFINER-funktioner har fast search_path', ex.filter((x) => x.d).every((x) => /search_path=public/.test(String(x.c))), ex.filter((x) => x.d).map((x) => x.n).join(','))
  const ri = (await q(`SELECT has_function_privilege('authenticated','public.reception_ingest(jsonb)','EXECUTE') u, has_function_privilege('anon','public.reception_ingest(jsonb)','EXECUTE') a`))[0]
  add('NY', 'reception_ingest-ACL bevaret fra 00249 (authenticated ja, anon nej)', ri.u === true && ri.a === false, '')
  const g = await q(`SELECT table_name || ':' || grantee || ':' || privilege_type g FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ${NEW_TABLES_250} AND grantee IN ('anon','PUBLIC','authenticated') ORDER BY 1`)
  add('NY', 'grants: anon/PUBLIC intet; authenticated kun SELECT web_chat_messages (+ kolonner på sessions uden token_hash)', g.map((x) => x.g).join(',') === 'web_chat_messages:authenticated:SELECT', g.map((x) => x.g).join(','))
  const rl = await q(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='web_chat_rate_limits' AND grantee IN ('anon','authenticated','service_role','PUBLIC')`)
  add('NY', 'web_chat_rate_limits: ingen tabel-grants til nogen API-rolle', rl[0].n === 0, `${rl[0].n}`)

  // ---- fixtures (i transaktionen)
  const adm = (await q(`SELECT id FROM profiles WHERE is_active AND role='admin' AND NOT EXISTS (SELECT 1 FROM user_permission_overrides o WHERE o.profile_id = profiles.id) ORDER BY created_at LIMIT 1`))[0]?.id as string | undefined
  const mon = (await q(`SELECT id FROM profiles WHERE is_active AND role='montør' AND NOT EXISTS (SELECT 1 FROM user_permission_overrides o WHERE o.profile_id = profiles.id) ORDER BY created_at LIMIT 1`))[0]?.id as string | undefined
  const custs = await q(`SELECT id FROM customers ORDER BY created_at LIMIT 2`)
  if (!adm || !mon || custs.length < 2) { add('NY', 'aktiv admin, montør og 2 kunder findes', false, ''); return }
  const [A, B] = [custs[0].id as string, custs[1].id as string]
  const thr = `dryrun250-${Date.now()}`
  const svc = async (sql: string, params: unknown[] = []): Promise<{ ok: boolean; rows: any[]; code?: string }> => {
    await q('SAVEPOINT s')
    try {
      await q(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('request.jwt.claim.role', 'service_role', true)`)
      await q('SET LOCAL ROLE service_role')
      const rows = await q(sql, params)
      await q('RESET ROLE'); await q('RELEASE SAVEPOINT s')
      return { ok: true, rows }
    } catch (e) {
      await q('ROLLBACK TO SAVEPOINT s'); await q('RESET ROLE')
      return { ok: false, rows: [], code: (e as { code?: string }).code }
    } finally { await q(`SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true)`) }
  }
  // Som rigtig medarbejder (authenticated + jwt), men BEHOLD effekten (savepoint frigives) — til at prøve triggere/afstemning
  const asKeep = async (uid: string, sql: string, params: unknown[] = []): Promise<{ ok: boolean; rows: any[]; code?: string }> => {
    await q('SAVEPOINT k')
    try {
      await q(`SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
      await q('SET LOCAL ROLE authenticated')
      const rows = await q(sql, params)
      await q('RESET ROLE'); await q('RELEASE SAVEPOINT k')
      return { ok: true, rows }
    } catch (e) {
      await q('ROLLBACK TO SAVEPOINT k'); await q('RESET ROLE')
      return { ok: false, rows: [], code: (e as { code?: string }).code }
    } finally { await q(`SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true)`) }
  }
  const ingest = async (p: Record<string, unknown>) => { const r = await svc(`SELECT public.reception_ingest($1::jsonb) r`, [JSON.stringify(p)]); return r.ok ? r.rows[0].r as { outcome: string; conversation_id: string } : { outcome: `err:${r.code}`, conversation_id: '' } }
  const mail = async (o: Record<string, unknown>) => (await q(`INSERT INTO incoming_emails (subject, sender_email, received_at, conversation_id, customer_id, linked_by, link_status) VALUES ($1, $2, now(), $3, $4, $5, coalesce($6, 'pending')::email_link_status) RETURNING id`,
    [o.subject ?? 'DRYRUN 250', o.sender ?? `dryrun250-${Math.random().toString(36).slice(2)}@dryrun250.invalid`, o.thread ?? null, o.customer ?? null, o.linked_by ?? null, o.status ?? null]))[0].id as string
  const convs: string[] = []
  const m1 = await mail({ thread: thr, customer: A, linked_by: 'auto', status: 'linked' })
  const r1 = await ingest({ source_table: 'incoming_emails', source_id: m1 }); convs.push(r1.conversation_id)
  const m2 = await mail({ thread: thr, subject: 'Re: DRYRUN 250' })
  const r2 = await ingest({ source_table: 'incoming_emails', source_id: m2 })
  add('NY', 'mail: ny ukoblet → created; svar i samme Graph-tråd → appended (samme henvendelse)', r1.outcome === 'created' && r2.outcome === 'appended' && r2.conversation_id === r1.conversation_id, `${r1.outcome}/${r2.outcome}`)
  const m3 = await mail({ thread: thr, customer: B, linked_by: 'auto', status: 'linked' })
  const r3 = await ingest({ source_table: 'incoming_emails', source_id: m3 }); if (r3.conversation_id) convs.push(r3.conversation_id)
  add('NY', 'mail: anden kunde (kandidat) svarer i tråden → ny henvendelse (ingen fletning på identitet)', r3.outcome === 'created' && r3.conversation_id !== r1.conversation_id, r3.outcome)
  const nBefore = (await q(`SELECT count(*)::int n FROM conversations`))[0].n
  const upd = await asKeep(adm, `UPDATE public.incoming_emails SET customer_id = $1, linked_by = 'manual', link_status = 'linked' WHERE id = $2 RETURNING id`, [A, m1])
  const c1 = (await q(`SELECT customer_id::text = $1 a, customer_match_state s, customer_candidate_id IS NULL c FROM conversations WHERE id = $2`, [A, r1.conversation_id]))[0]
  const nAfter = (await q(`SELECT count(*)::int n FROM conversations`))[0].n
  const aud = (await q(`SELECT count(*)::int n FROM audit_logs WHERE entity_id = $1 AND action = 'conversation_source_reconciled' AND user_id = $2`, [r1.conversation_id, adm]))[0].n
  add('NY', 'afstemning: admin kobler mailen manuelt (egen klient/RLS) → samme henvendelse bekræftet, ingen ny, auditeret som admin', upd.ok && upd.rows.length === 1 && c1?.a && c1.s === 'confirmed' && c1.c && nBefore === nAfter && aud === 1, `${upd.ok ? upd.rows.length : upd.code} ${c1?.s} ${nBefore}->${nAfter} audit=${aud}`)
  const items = (await q(`SELECT count(*)::int n FROM conversation_items WHERE conversation_id = $1`, [r1.conversation_id]))[0].n
  const detached = (await q(`SELECT count(*)::int n FROM audit_logs WHERE entity_id = $1 AND action = 'conversation_item_detached'`, [r1.conversation_id]))[0].n
  if (detached) convs.push(...(await q(`SELECT conversation_id FROM conversation_items WHERE source_table='incoming_emails' AND source_id = $1`, [m2])).map((x) => x.conversation_id as string))
  add('NY', 'afstemning: ukoblet tråd-svar bliver i tråden (ingen udflytning uden konflikt)', items === 2 && detached === 0, `${items}/${detached}`)
  const p1 = (await q(`INSERT INTO portal_messages (customer_id, sender_type, sender_name, message) VALUES ($1, 'customer', 'DRYRUN', 'DRYRUN 250 a') RETURNING id`, [A]))[0].id as string
  const p2 = (await q(`INSERT INTO portal_messages (customer_id, sender_type, sender_name, message) VALUES ($1, 'customer', 'DRYRUN', 'DRYRUN 250 b') RETURNING id`, [A]))[0].id as string
  const rp1 = await ingest({ source_table: 'portal_messages', source_id: p1 }), rp2 = await ingest({ source_table: 'portal_messages', source_id: p2 })
  convs.push(rp1.conversation_id, rp2.conversation_id)
  add('NY', 'portal uden tilbud: to beskeder samme kunde samme dag → to henvendelser', rp1.outcome === 'created' && rp2.outcome === 'created' && rp1.conversation_id !== rp2.conversation_id, `${rp1.outcome}/${rp2.outcome}`)
  const ws = await svc(`INSERT INTO web_chat_sessions (token_hash) VALUES (md5(random()::text) || md5(random()::text)) RETURNING id`)
  const wm = ws.ok ? await svc(`INSERT INTO web_chat_messages (session_id, direction, author, body) VALUES ($1, 'inbound', 'visitor', 'DRYRUN 250') RETURNING id`, [ws.rows[0].id]) : { ok: false, rows: [] as any[], code: 'nosession' }
  const rw = wm.ok ? await ingest({ source_table: 'web_chat_messages', source_id: wm.rows[0].id }) : { outcome: 'err', conversation_id: '' }
  if (rw.conversation_id) convs.push(rw.conversation_id)
  add('NY', 'web-chat (service_role): session+besked → henvendelse; aldrig bekræftet kunde', rw.outcome === 'created', rw.outcome)
  const userChat = await as({ uid: adm }, `INSERT INTO public.web_chat_messages (session_id, direction, author, body) VALUES ($1, 'inbound', 'visitor', 'x')`, [ws.rows[0]?.id ?? null])
  add('NY', 'web-chat: medarbejder kan ikke skrive chat-kilder (42501)', !userChat.ok && userChat.code === '42501', userChat.ok ? 'tilladt' : userChat.code)
  const tokenRead = await as({ uid: adm }, `SELECT token_hash FROM public.web_chat_sessions LIMIT 1`)
  add('NY', 'web-chat: token_hash ulæselig for medarbejder (42501)', !tokenRead.ok && tokenRead.code === '42501', tokenRead.ok ? 'læsbar' : tokenRead.code)
  const key = 'a'.repeat(64)
  const rate = await svc(`SELECT public.web_chat_rate_check($1, 'start', 1, 10, 1000) r1, public.web_chat_rate_check($1, 'start', 1, 10, 1000) r2`, [key])
  add('NY', 'misbrugsværn (service_role): 1. tilladt, 2. afvist (burst)', rate.ok && rate.rows[0].r1.allowed === true && rate.rows[0].r2.allowed === false, rate.ok ? '' : String(rate.code))
  const rateUser = await as({ uid: adm }, `SELECT public.web_chat_rate_check($1, 'start', 1, 10, 1000)`, [key])
  const rateAnon = await as('anon', `SELECT public.web_chat_rate_check($1, 'start', 1, 10, 1000)`, [key])
  add('NY', 'misbrugsværn: authenticated/anon kan ikke kalde (42501)', !rateUser.ok && rateUser.code === '42501' && !rateAnon.ok && rateAnon.code === '42501', `${(rateUser as { code?: string }).code}/${(rateAnon as { code?: string }).code}`)
  const recUser = await as({ uid: adm }, `SELECT public.reception_reconcile_source('incoming_emails', $1)`, [m1])
  add('NY', 'afstemning kan ikke kaldes af medarbejder (42501)', !recUser.ok && recUser.code === '42501', recUser.ok ? 'tilladt' : recUser.code)
  const ret = await svc(`SELECT public.reception_retention('{}'::jsonb, false) r`)
  add('NY', 'retention dry-run (service_role): applied=false, ingen konflikter, intet ændret', ret.ok && ret.rows[0].r.applied === false && ret.rows[0].r.source_link_conflicts === 0
    && (await q(`SELECT count(*)::int n FROM conversation_items WHERE text_purged_at IS NOT NULL OR source_missing_at IS NOT NULL`))[0].n === 0, ret.ok ? JSON.stringify({ c: ret.rows[0].r.source_link_conflicts }) : String(ret.code))
  const retUser = await as({ uid: adm }, `SELECT public.reception_retention('{}'::jsonb, true)`)
  add('NY', 'retention kan ikke køres af medarbejder (42501)', !retUser.ok && retUser.code === '42501', retUser.ok ? 'tilladt' : retUser.code)
  const ids = [...new Set(convs.filter(Boolean))]
  const seenAdm = await as({ uid: adm }, `SELECT count(*)::int n FROM public.conversations WHERE id = ANY ($1::uuid[])`, [ids])
  const seenMon = await as({ uid: mon }, `SELECT count(*)::int n FROM public.conversations WHERE id = ANY ($1::uuid[])`, [ids])
  const monChat = await as({ uid: mon }, `SELECT count(*)::int n FROM public.web_chat_messages`)
  const anonC = await as('anon', `SELECT count(*)::int n FROM public.conversations`)
  const anonW = await as('anon', `SELECT count(*)::int n FROM public.web_chat_messages`)
  add('NY', `personaer: admin ser fixtures (${seenAdm.ok ? seenAdm.rows[0].n : '?'}/${ids.length}); montør 0 henvendelser + 0 chat; anon 42501`,
    seenAdm.ok && seenAdm.rows[0].n === ids.length && seenMon.ok && seenMon.rows[0].n === 0 && monChat.ok && monChat.rows[0].n === 0 && !anonC.ok && anonC.code === '42501' && !anonW.ok && anonW.code === '42501',
    `${seenMon.ok ? seenMon.rows[0].n : seenMon.code}/${monChat.ok ? monChat.rows[0].n : monChat.code}/${(anonC as { code?: string }).code}/${(anonW as { code?: string }).code}`)

  // ---- oprydning af fixtures + rollback-blok (kun dry-run)
  await q(`DELETE FROM conversations WHERE id = ANY ($1::uuid[])`, [ids])
  await q(`DELETE FROM incoming_emails WHERE id = ANY ($1::uuid[])`, [[m1, m2, m3]])
  await q(`DELETE FROM portal_messages WHERE id = ANY ($1::uuid[])`, [[p1, p2]])
  if (ws.ok) await q(`DELETE FROM web_chat_sessions WHERE id = $1`, [ws.rows[0].id])
  await q(`DELETE FROM web_chat_rate_limits WHERE key_hash IN ($1, 'global')`, [key])
  const fp2 = (await q(FP_00250_SQL))[0]
  const changed2 = FP_00250.map(([t]) => t).filter((t) => fp2[t] !== fp0[t])
  add('NY', 'efter oprydning: data-fingeraftryk = før', changed2.length === 0, changed2.join(',') || 'alle = før')
  if (POST) return
  await q(rollback00250Sql(false))
  const cat2 = (await q(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p`))[0]
  const struct2 = (await q(`SELECT ${STRUCT_MD5} s`))[0].s as string
  const left = (await q(`SELECT (SELECT count(*)::int FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ${NEW_TABLES_250}) t,
    (SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ${NEW_FUNCS_250}) f,
    (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'trg_incoming_emails_reception_reconcile') g`))[0]
  const fp3 = (await q(FP_00250_SQL))[0]
  const changed3 = FP_00250.map(([t]) => t).filter((t) => fp3[t] !== fp0[t])
  add('NY', 'rollback-blok: alle 00250-objekter væk (tabeller, funktioner, mail-trigger)', left.t === 0 && left.f === 0 && left.g === 0, JSON.stringify(left))
  add('NY', 'rollback-blok: katalog = før', cat2.k === cat0.k && cat2.p === cat0.p, `${cat2.k}/${cat2.p}`)
  add('NY', 'rollback-blok: struktur-md5 af hele public = før (præcis 00249-tilstand)', struct2 === struct0, `${struct2.slice(0, 8)}… vs ${struct0.slice(0, 8)}…`)
  add('NY', 'rollback-blok: data-fingeraftryk = før', changed3.length === 0, changed3.join(',') || 'alle = før')
}))
