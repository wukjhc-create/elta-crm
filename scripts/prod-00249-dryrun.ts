/**
 * 00249 — PRODUCTION DRY-RUN, ROLLBACK-ONLY (prod-rollback-probe.ts: ÉN transaktion, ALTID ROLLBACK, COMMIT forbudt).
 *   npx tsx scripts/prod-00249-dryrun.ts
 * 1. før: katalog, data-fingeraftryk, struktur-md5
 * 2. den PRÆCISE migrationskrop (supabase/migrations/00249…sql uden BEGIN/COMMIT) køres
 * 3. efter krop: +3 nøgler/+10 standarder, data-fingeraftryk = før (intet omskrevet), grants/ACL, 0 rækker
 * 4. fixtures I transaktionen via reception_ingest (som rigtige prod-profiler) + én prøve-opkaldsrække; personaer
 *    admin / serviceleder / salg / bogholderi (rolle sat på montør-profilen i en savepoint, som 00245/00246) / montør / anon
 * 5. filens ROLLBACK-blok køres → struktur-md5 og katalog = før, alle 00249-objekter væk, data-fingeraftryk = før
 * 6. transaktionen rulles tilbage (intet består).
 * --post: EFTER permanent anvendelse — springer 2 (krop) og 5 (rollback-blok) over; personaer/ACL mod det anvendte skema. Kun PASS/FAIL + antal/koder ud — ingen id'er, navne eller indhold.
 */
import { withProdRollbackProbe, runMain } from './prod-rollback-probe'
import { STRUCT_MD5, NEW_TABLES, NEW_FUNCS, migration00249Body, rollback00249Sql } from './test-harness/reception-00249-probe'
import { FP_00249, FP_00249_SQL } from './prod-00249-preflight-shared'

type Who = { uid: string } | 'anon'

const POST = process.argv.includes('--post')

runMain(() => withProdRollbackProbe(POST ? '00249-post-personas' : '00249-dryrun', async ({ q, as, add, notTestable }) => {
  // ---- 1) før
  const cat0 = (await q(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p`))[0]
  const fp0 = (await q(FP_00249_SQL))[0]
  const struct0 = (await q(`SELECT ${STRUCT_MD5} s`))[0].s as string
  const nT = (await q(`SELECT count(*)::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ${NEW_TABLES}`))[0].n
  if (POST) add('NY', 'efter: 00249 er anvendt (4 tabeller, katalog 120/291)', nT === 4 && cat0.k === 120 && cat0.p === 291, `katalog ${cat0.k}/${cat0.p}, struktur ${struct0.slice(0, 8)}…`)
  else add('UÆNDRET', 'før: 00249 ikke anvendt', nT === 0, `katalog ${cat0.k}/${cat0.p}, struktur ${struct0.slice(0, 8)}…`)

  // ---- 2) præcis migrationskrop
  const body = migration00249Body()
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body)) throw new Error('kroppen indeholder transaktionskontrol')
  let applied = true
  if (POST) { /* allerede anvendt permanent */ } else try { await q(body) } catch (e) { applied = false; add('NY', 'migrationskroppen kører rent', false, (e as { code?: string }).code ?? 'fejl') }
  if (!applied) return
  if (!POST) add('NY', 'migrationskroppen kører rent (guard-blok, tabeller, værn, funktioner, politikker, grants)', true, '')

  // ---- 3) efter krop
  const cat1 = (await q(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p`))[0]
  if (!POST) add('NY', 'katalog +3 nøgler, +10 rollestandarder', cat1.k === cat0.k + 3 && cat1.p === cat0.p + 10, `${cat0.k}/${cat0.p} → ${cat1.k}/${cat1.p}`)
  const keys = await q(`SELECT role || ':' || permission d FROM role_permission_defaults WHERE permission LIKE 'conversations.%' ORDER BY 1`)
  add('NY', 'standarder: view (admin/serviceleder/salg/bogholderi), view_unmatched (admin/serviceleder), manage (admin/serviceleder/salg/bogholderi); ingen montør',
    keys.map((k) => k.d).join(',') === 'admin:conversations.manage,admin:conversations.view,admin:conversations.view_unmatched,bogholderi:conversations.manage,bogholderi:conversations.view,salg:conversations.manage,salg:conversations.view,serviceleder:conversations.manage,serviceleder:conversations.view,serviceleder:conversations.view_unmatched', `${keys.length}`)
  const fp1 = (await q(FP_00249_SQL))[0]
  const dataTables = FP_00249.map(([t]) => t).filter((t) => t !== 'permission_catalog' && t !== 'role_permission_defaults')
  const changed = dataTables.filter((t) => fp1[t] !== fp0[t])
  add('NY', `ingen eksisterende rækker ændret (${dataTables.join(', ')})`, changed.length === 0, changed.join(',') || 'alle = før')
  const tabs = await q(`SELECT relname || ':' || relrowsecurity t FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ${NEW_TABLES} AND relkind='r' ORDER BY 1`)
  add('NY', '4 tabeller, RLS slået til', tabs.map((x) => x.t).join(',') === 'conversation_actions:true,conversation_items:true,conversations:true,upload_requests:true', tabs.map((x) => x.t).join(','))
  const g = await q(`SELECT table_name || ':' || grantee || ':' || privilege_type g FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ${NEW_TABLES} AND grantee IN ('anon','PUBLIC')`)
  const cg = await q(`SELECT count(*)::int n FROM information_schema.column_privileges WHERE table_schema='public' AND table_name IN ${NEW_TABLES} AND grantee IN ('anon','PUBLIC')`)
  add('NY', 'ingen tabel-/kolonne-grants til anon/PUBLIC', g.length === 0 && cg[0].n === 0, g.map((x) => x.g).join(','))
  const ag = await q(`SELECT table_name || ':' || privilege_type g FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ${NEW_TABLES} AND grantee='authenticated' ORDER BY 1`)
  add('NY', 'authenticated: ingen INSERT på henvendelser/items; upload_requests kun kolonne-grants',
    ag.map((x) => x.g).join(',') === 'conversation_actions:INSERT,conversation_actions:SELECT,conversation_actions:UPDATE,conversation_items:SELECT,conversations:SELECT,conversations:UPDATE', ag.map((x) => x.g).join(','))
  const tok = (await q(`SELECT has_column_privilege('authenticated','public.upload_requests','token_hash','SELECT') s, has_column_privilege('authenticated','public.upload_requests','files_uploaded','UPDATE') u`))[0]
  add('NY', 'token_hash ulæselig og kvote ikke skrivbar for authenticated', tok.s === false && tok.u === false, '')
  const ex = await q(`SELECT p.proname n, p.prosecdef d, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') u, has_function_privilege('service_role', p.oid, 'EXECUTE') s, array_to_string(p.proconfig, ',') c FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ${NEW_FUNCS} ORDER BY 1`)
  add('NY', 'EXECUTE: anon intet; authenticated kun reception_ingest + conversation_visible', ex.length === 9 && ex.every((x) => !x.a) && ex.filter((x) => x.u).map((x) => x.n).join(',') === 'conversation_visible,reception_ingest', ex.map((x) => `${x.n}:${x.a ? 'A' : '-'}${x.u ? 'U' : '-'}${x.s ? 'S' : '-'}`).join(' '))
  add('NY', 'alle SECURITY DEFINER-funktioner har fast search_path', ex.filter((x) => x.d).every((x) => /search_path=public/.test(String(x.c))), ex.filter((x) => x.d).map((x) => x.n).join(','))
  const sg = await q(`SELECT table_name || ':' || privilege_type g FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ${NEW_TABLES} AND grantee='service_role' ORDER BY 1`)
  add('NY', 'service_role: tabel-adgang KUN til de 4 nye tabeller (værn håndhæver kun-forslag/marker); ingen nye grants på eksisterende tabeller', sg.length > 0 && sg.every((x) => /^(conversations|conversation_items|conversation_actions|upload_requests):/.test(x.g)), `${sg.length} privilegier`)

  // ---- 4) fixtures (i transaktionen) + personaer
  const adm = (await q(`SELECT id FROM profiles WHERE is_active AND role='admin' AND NOT EXISTS (SELECT 1 FROM user_permission_overrides o WHERE o.profile_id = profiles.id) ORDER BY created_at LIMIT 1`))[0]?.id as string | undefined
  const mon = (await q(`SELECT id FROM profiles WHERE is_active AND role='montør' AND NOT EXISTS (SELECT 1 FROM user_permission_overrides o WHERE o.profile_id = profiles.id) ORDER BY created_at LIMIT 1`))[0]?.id as string | undefined
  if (!adm || !mon) { add('NY', 'aktiv admin og montør uden overrides findes', false, ''); return }
  const scope = await as({ uid: mon }, `SELECT unnest(public.my_customer_scope_ids()) id`)
  const monScope = new Set(scope.ok ? scope.rows.map((r) => r.id as string) : [])
  const pick = async (sql: string) => ((await q(sql))[0] ?? null) as Record<string, string> | null
  const mailUn = await pick(`SELECT id FROM incoming_emails WHERE customer_id IS NULL AND link_status::text <> 'ignored' ORDER BY received_at DESC LIMIT 1`)
  const mailAuto = await pick(`SELECT id, customer_id FROM incoming_emails WHERE customer_id IS NOT NULL AND linked_by IS DISTINCT FROM 'manual' AND link_status::text <> 'ignored' ORDER BY received_at DESC LIMIT 1`)
  const mailMan = await pick(`SELECT id, customer_id FROM incoming_emails WHERE customer_id IS NOT NULL AND linked_by = 'manual' AND link_status::text <> 'ignored' ORDER BY received_at DESC LIMIT 1`)
  const portal = await pick(`SELECT id, customer_id FROM portal_messages WHERE sender_type='customer' AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT 1`)
  const call = await pick(`INSERT INTO telephony_calls (provider, provider_call_id, started_at, direction, to_number_normalized) VALUES ('relatel', 'dryrun-249-' || gen_random_uuid(), now(), 'inbound', '4500000000') RETURNING id`)
  const ingest = async (who: 'admin' | 'service_role', p: Record<string, unknown>): Promise<{ ok: boolean; out: any; code?: string }> => {
    await q('SAVEPOINT fx')
    try {
      await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(who === 'admin' ? { sub: adm, role: 'authenticated' } : { role: 'service_role' })])
      await q(`SELECT set_config('request.jwt.claim.role', $1, true)`, [who === 'admin' ? 'authenticated' : 'service_role'])
      await q(`SET LOCAL ROLE ${who === 'admin' ? 'authenticated' : 'service_role'}`)
      const out = (await q(`SELECT public.reception_ingest($1::jsonb) r`, [JSON.stringify(p)]))[0].r
      await q('RESET ROLE')
      await q('RELEASE SAVEPOINT fx')
      return { ok: true, out }
    } catch (e) {
      await q('ROLLBACK TO SAVEPOINT fx')
      await q('RESET ROLE')
      return { ok: false, out: null, code: (e as { code?: string }).code }
    } finally {
      await q(`SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true)`)
    }
  }
  const fx: Record<string, { id: string | null; channel: string; customer: string | null; candidate: string | null; source?: { table: string; id: string } }> = {}
  const mk = async (name: string, who: 'admin' | 'service_role', p: Record<string, unknown>, customer: string | null, candidate: string | null, channel: string, source?: { table: string; id: string }) => {
    const r = await ingest(who, p)
    fx[name] = { id: r.ok && r.out?.outcome === 'created' ? r.out.conversation_id : null, channel, customer, candidate, source }
    add('NY', `fixture ${name} via reception_ingest (${who})`, !!fx[name].id, r.ok ? String(r.out?.outcome) : String(r.code))
  }
  await mk('sim', 'admin', { source_table: 'simulator', dedupe_key: `sim:${crypto.randomUUID()}`, title: 'DRYRUN 249', urgency: 'emergency', status: 'handoff',
    actions: [{ action_type: 'create_task', policy_outcome: 'auto', idempotency_key: 'dry:t', execute: true }] }, null, null, 'phone')
  if (mailUn) await mk('mail_unlinked', 'admin', { source_table: 'incoming_emails', source_id: mailUn.id }, null, null, 'email', { table: 'incoming_emails', id: mailUn.id })
  if (mailAuto) await mk('mail_auto_candidate', 'admin', { source_table: 'incoming_emails', source_id: mailAuto.id }, null, mailAuto.customer_id, 'email', { table: 'incoming_emails', id: mailAuto.id })
  if (mailMan) await mk('mail_manual_confirmed', 'admin', { source_table: 'incoming_emails', source_id: mailMan.id, confirmed_customer_id: mailMan.customer_id }, mailMan.customer_id, null, 'email', { table: 'incoming_emails', id: mailMan.id })
  else notTestable('mail_manual_confirmed', 'ingen manuelt koblet mail i prod')
  if (portal) await mk('portal_confirmed', 'admin', { source_table: 'portal_messages', source_id: portal.id }, portal.customer_id, null, 'portal', { table: 'portal_messages', id: portal.id })
  if (call) await mk('call_unmatched', 'admin', { source_table: 'telephony_calls', source_id: call.id }, null, null, 'phone', { table: 'telephony_calls', id: call.id })
  await mk('bg_webchat', 'service_role', { source_table: 'manual', provider: 'web_chat', provider_event_id: `dryrun-249-${Date.now()}`, channel: 'web_chat', urgency: 'emergency', status: 'handoff',
    actions: [{ action_type: 'create_task', policy_outcome: 'auto', idempotency_key: 'dry:bg', execute: true }] }, null, null, 'web_chat')
  if (fx.sim.id) {
    const st = await q(`SELECT action_type || '/' || state || '/' || actor s FROM conversation_actions WHERE conversation_id = $1`, [fx.sim.id])
    add('NY', 'medarbejder-indtag: auto+execute → approved som ai_receptionist (udføres af appen med medarbejderens rettigheder)', st.map((x) => x.s).join() === 'create_task/approved/ai_receptionist', st.map((x) => x.s).join())
  }
  if (fx.bg_webchat.id) {
    const b = (await q(`SELECT c.intake_actor || '/' || coalesce(c.created_by::text,'null') || '/' || coalesce(c.assigned_profile_id::text,'null') || '/' || c.urgency s,
      (SELECT string_agg(DISTINCT state || ':' || coalesce(created_by::text, 'null'), ',') FROM conversation_actions WHERE conversation_id = c.id) a,
      (SELECT count(*)::int FROM audit_logs WHERE entity_id = c.id AND user_id IS NULL AND metadata->>'actor' = 'ai_receptionist' AND metadata->>'mode' = 'background') au
      FROM conversations c WHERE c.id = $1`, [fx.bg_webchat.id]))[0]
    add('NY', 'baggrundsaktør: intake_actor ai_receptionist, ingen bruger, ingen tildelt person, kun forslag, auditeret', b.s === 'ai_receptionist/null/null/emergency' && b.a === 'proposed:null' && b.au === 1, `${b.s} ${b.a} audit=${b.au}`)
    await q('SAVEPOINT bgap')
    let code = 'ok'
    try { await q(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`); await q('SET LOCAL ROLE service_role'); await q(`UPDATE conversation_actions SET state='approved' WHERE conversation_id = $1`, [fx.bg_webchat.id]) } catch (e) { code = (e as { code?: string }).code ?? 'fejl' }
    await q('ROLLBACK TO SAVEPOINT bgap'); await q('RESET ROLE'); await q(`SELECT set_config('request.jwt.claims', '', true)`)
    add('NY', 'baggrundsaktør (service_role) kan ikke godkende/udføre et AI-forslag', code === '23514', code)
    await q('SAVEPOINT bgins')
    code = 'ok'
    try { await q(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`); await q('SET LOCAL ROLE service_role'); await q(`INSERT INTO conversations (channel, title, dedupe_key, first_at, last_at, intake_actor, created_by) VALUES ('phone','x','dry:svc',now(),now(),'ai_receptionist',NULL)`) } catch (e) { code = (e as { code?: string }).code ?? 'fejl' }
    await q('ROLLBACK TO SAVEPOINT bgins'); await q('RESET ROLE'); await q(`SELECT set_config('request.jwt.claims', '', true)`)
    add('NY', 'service_role kan ikke oprette henvendelser uden om reception_ingest', code === '42501', code)
  }

  const ids = Object.values(fx).map((f) => f.id).filter((x): x is string => !!x)
  const setRole = (role: string) => [`UPDATE public.profiles SET role = '${role}' WHERE id = '${mon}'`]
  const PERMS = ['conversations.view', 'conversations.view_unmatched', 'conversations.manage', 'calls.view', 'calls.view_unmatched', 'customers.emails.view', 'inbox.view', 'customers.edit', 'customers.view.all']
  const personas: Array<{ name: string; who: Who; setup: string[] }> = [
    { name: 'admin', who: { uid: adm }, setup: [] },
    { name: 'serviceleder', who: { uid: mon }, setup: setRole('serviceleder') },
    { name: 'salg', who: { uid: mon }, setup: setRole('salg') },
    { name: 'bogholderi', who: { uid: mon }, setup: setRole('bogholderi') },
    { name: 'montør', who: { uid: mon }, setup: [] },
  ]
  for (const p of personas) {
    const perm = await as(p.who, `SELECT ${PERMS.map((k, i) => `public.user_has_permission('${k}') p${i}`).join(', ')}, cardinality(public.my_customer_scope_ids()) n`, [], p.setup)
    if (!perm.ok) { add('NY', `${p.name}: rettigheder læsbare`, false, perm.code); continue }
    const h = Object.fromEntries(PERMS.map((k, i) => [k, !!perm.rows[0][`p${i}`]])) as Record<string, boolean>
    const sc = await as(p.who, `SELECT unnest(public.my_customer_scope_ids()) id`, [], p.setup)
    const inScope = new Set(sc.ok ? sc.rows.map((r) => r.id as string) : [])
    const seen = await as(p.who, `SELECT id FROM public.conversations WHERE id = ANY ($1::uuid[])`, [ids], p.setup)
    const seenSet = new Set(seen.ok ? seen.rows.map((r) => r.id as string) : [])
    // Forventning efter reviewets regel (kanal-ret + kunde-scope / ukoblet med kildens ukoblede nøgler + kandidat-scope)
    const want = (f: typeof fx[string]) => {
      if (!h['conversations.view']) return false
      if (f.channel === 'phone' && !h['calls.view']) return false
      if ((f.channel === 'email' || f.channel === 'web_chat') && !(h['customers.emails.view'] || h['inbox.view'])) return false
      if (f.customer) return h['customers.view.all'] || inScope.has(f.customer)
      if (!h['conversations.view_unmatched']) return false
      if (f.channel === 'phone' && !h['calls.view_unmatched']) return false
      if ((f.channel === 'email' || f.channel === 'web_chat') && !(h['inbox.view'] || (h['customers.emails.view'] && h['customers.edit'] && h['customers.view.all']))) return false
      return !f.candidate || h['customers.view.all'] || inScope.has(f.candidate)
    }
    const mism = Object.entries(fx).filter(([, f]) => f.id && want(f) !== seenSet.has(f.id)).map(([n]) => n)
    add('NY', `${p.name}: synlige henvendelser = reglen (${seenSet.size}/${ids.length}: ${Object.entries(fx).filter(([, f]) => f.id && seenSet.has(f.id)).map(([n]) => n).join(',') || 'ingen'})`, seen.ok && mism.length === 0, mism.join(',') || 'ok')
    // Mail/opkald: en synlig kilde-henvendelse ⇒ brugeren kan også se kilderækken (ingen omvej uden om kildens RLS)
    const leaks: string[] = []
    for (const [n, f] of Object.entries(fx)) {
      if (!f.id || !f.source || !seenSet.has(f.id) || f.source.table === 'portal_messages') continue
      const src = await as(p.who, `SELECT 1 FROM public.${f.source.table} WHERE id = $1`, [f.source.id], p.setup)
      if (!src.ok || src.rows.length !== 1) leaks.push(n)
    }
    add('NY', `${p.name}: synlig mail-/opkalds-henvendelse ⇒ kilden er også synlig for brugeren`, leaks.length === 0, leaks.join(',') || 'ok')
    const unm = Object.entries(fx).filter(([, f]) => f.id && !f.customer && seenSet.has(f.id)).length
    if (!h['conversations.view_unmatched']) add('NY', `${p.name}: uden conversations.view_unmatched ses ingen ukoblede`, unm === 0, `${unm}`)
    if (p.name === 'montør') {
      add('NY', 'montør: ingen generel Henvendelser-adgang (0 henvendelser, ingen view/manage)', seenSet.size === 0 && !h['conversations.view'] && !h['conversations.manage'], `${seenSet.size}`)
      const r = await as(p.who, `SELECT public.reception_ingest('{"source_table":"simulator","dedupe_key":"sim:00000000-0000-4000-8000-000000000249"}'::jsonb)`, [], p.setup)
      add('NY', 'montør: reception_ingest afvist (42501)', !r.ok && r.code === '42501', r.ok ? 'tilladt' : r.code)
    }
    if (p.name === 'salg') {
      const r = await as(p.who, mailUn ? `SELECT public.reception_ingest(jsonb_build_object('source_table','incoming_emails','source_id','${mailUn.id}'))` : `SELECT 1`, [], p.setup)
      add('NY', 'salg: kan ikke indtage en ukoblet mail (42501)', !r.ok && r.code === '42501', r.ok ? 'tilladt' : r.code)
    }
  }
  // Direkte skrivning som authenticated (admin) og anon på alle 00249-objekter
  const tryAs = async (who: Who, stmt: string): Promise<string> => {
    await q('SAVEPOINT w')
    let code = 'ok'
    try {
      if (who === 'anon') await q('SET LOCAL ROLE anon')
      else { await q(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.uid, role: 'authenticated' })]); await q('SET LOCAL ROLE authenticated') }
      await q(stmt)
    } catch (e) { code = (e as { code?: string }).code ?? 'fejl' }
    await q('ROLLBACK TO SAVEPOINT w'); await q('RESET ROLE'); await q(`SELECT set_config('request.jwt.claims', '', true)`)
    return code
  }
  add('NY', 'admin: direkte INSERT i conversations afvist (42501)', (await tryAs({ uid: adm }, `INSERT INTO public.conversations (channel, title, dedupe_key, first_at, last_at) VALUES ('phone','x','dry:direct',now(),now())`)) === '42501', '')
  add('NY', 'admin: direkte INSERT i conversation_items afvist (42501)', (await tryAs({ uid: adm }, `INSERT INTO public.conversation_items (conversation_id, channel, direction, provider, source_table, occurred_at, dedupe_key) VALUES ('${fx.sim.id}','phone','inbound','simulator','simulator',now(),'dry:item')`)) === '42501', '')
  add('NY', 'admin: AI-handling (actor ai_receptionist) kan ikke indsættes direkte', ['42501'].includes(await tryAs({ uid: adm }, `INSERT INTO public.conversation_actions (conversation_id, action_type, policy_outcome, state, actor, idempotency_key, created_by) VALUES ('${fx.sim.id}','create_task','auto','approved','ai_receptionist','dry:fake','${adm}')`)), '')
  for (const t of ['conversations', 'conversation_items', 'conversation_actions', 'upload_requests']) {
    const r = await as('anon', `SELECT count(*)::int n FROM public.${t}`)
    const w = await tryAs('anon', t === 'upload_requests' ? `INSERT INTO public.upload_requests (customer_id, token_hash, expires_at) VALUES (gen_random_uuid(), repeat('a',64), now() + interval '1 day')` : `DELETE FROM public.${t}`)
    add('NY', `anon: ${t} hverken læsbar eller skrivbar`, !r.ok && r.code === '42501' && w === '42501', `læs=${r.ok ? 'tilladt' : r.code} skriv=${w}`)
  }
  const anonRpc = await as('anon', `SELECT public.reception_ingest('{}'::jsonb)`)
  add('NY', 'anon: reception_ingest kan ikke kaldes (42501)', !anonRpc.ok && anonRpc.code === '42501', anonRpc.ok ? 'tilladt' : anonRpc.code)

  // ---- 5) filens ROLLBACK-blok → præcis før-tilstand (kun dry-run; --post ruller blot transaktionen tilbage)
  if (POST) return
  if (call) await q(`DELETE FROM telephony_calls WHERE id = $1`, [call.id])
  await q(rollback00249Sql(false))
  const cat2 = (await q(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) p`))[0]
  const struct2 = (await q(`SELECT ${STRUCT_MD5} s`))[0].s as string
  const left = (await q(`SELECT (SELECT count(*)::int FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ${NEW_TABLES}) t,
    (SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ${NEW_FUNCS}) f,
    (SELECT count(*)::int FROM permission_catalog WHERE permission LIKE 'conversations.%') k`))[0]
  const fp2 = (await q(FP_00249_SQL))[0]
  const changed2 = FP_00249.map(([t]) => t).filter((t) => fp2[t] !== fp0[t])
  add('NY', 'rollback-blok: alle 00249-objekter væk', left.t === 0 && left.f === 0 && left.k === 0, JSON.stringify(left))
  add('NY', 'rollback-blok: katalog = før', cat2.k === cat0.k && cat2.p === cat0.p, `${cat2.k}/${cat2.p}`)
  add('NY', 'rollback-blok: struktur-md5 af hele public = før (præcis)', struct2 === struct0, `${struct2.slice(0, 8)}… vs ${struct0.slice(0, 8)}…`)
  add('NY', 'rollback-blok: data-fingeraftryk = før (inkl. katalog/standarder; audit_logs-rækker fra fixtures rulles tilbage med transaktionen)', changed2.length === 0, changed2.join(',') || 'alle = før')
}))
