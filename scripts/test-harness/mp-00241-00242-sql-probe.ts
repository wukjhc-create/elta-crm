/**
 * MP-00241/00242 SQL-UDKAST — ROLLBACK-ONLY prøve på staging (intet anvendes):
 *   00240 + 00241 + 00242 (docs/runbooks/mp-0024x-draft.sql) køres i ÉN DO-blok der ALTID slutter med RAISE EXCEPTION.
 *   Børne-fixtures oprettes INDE i blokken (rulles tilbage); kunder/sager/arbejdsordrer/opgaver fra setup240.
 * Pr. persona (rigtige uid'er, SET LOCAL ROLE authenticated + request.jwt.claims): hvilke fixture-rækker er synlige i
 * kontakter, kundenoter, dokumenter, tagtegninger, bekræftelser, arbejdsordrer, sagsnoter, sagsbilag, opgaver,
 * fakturaer/-linjer/-betalinger — sammenlignet med Henriks regler (O1–O6, F1). Dokumenter tjekkes desuden mod appens
 * customerDocumentReadDenied (PARITET). Før/efter-fingeraftryk skal være identisk.
 *   npx tsx scripts/test-harness/cli.ts mp-00241-00242-sql-probe
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { computeEffectivePermissions } from '../../src/lib/auth/effective-permissions'
import { PERMISSION_TEMPLATES, templateOverrides } from '../../src/lib/auth/permission-templates'
import type { Permission } from '../../src/lib/auth/permissions'
import { setup240, type M240Check } from './mp-00240-scope-check'

type RawSql = (sql: string) => Promise<{ ok: boolean; status: number; text: string }>

/** Et udkasts krop mellem BEGIN; og NOTIFY (uden transaktionskontrol) */
export function draftBodyOf(file: string): string {
  const sql = readFileSync(resolve(process.cwd(), 'docs', 'runbooks', file), 'utf8').replace(/\r\n/g, '\n')
  const a = sql.indexOf('\nBEGIN;\n'), b = sql.indexOf("\nNOTIFY pgrst, 'reload schema';")
  if (a < 0 || b < a) throw new Error(`${file}: har ikke BEGIN; … NOTIFY`)
  const body = sql.slice(a + '\nBEGIN;\n'.length, b)
  if (/\b(COMMIT|ROLLBACK)\b/i.test(body.replace(/--.*$/gm, ''))) throw new Error(`${file}: transaktionskontrol i kroppen`)
  if (body.includes('$draft$')) throw new Error(`${file}: indeholder $draft$`)
  return body
}

const TABLES = ['customer_contacts', 'customer_notes', 'customer_documents', 'roof_drawings', 'document_confirmations', 'work_orders',
  'case_notes', 'service_case_attachments', 'customer_tasks', 'invoices', 'invoice_lines', 'invoice_payments'] as const

export async function runMp0024142SqlProbe(c: { admin: SupabaseClient; url: string; anonKey: string; rawSql: RawSql }): Promise<M240Check[]> {
  const out: M240Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const tl = TABLES.map((t) => `'${t}'`).join(',')
  const fingerprint = async () => (await c.rawSql(`SELECT json_build_object(
      'pol', (SELECT json_agg(tablename || '.' || policyname || ':' || cmd || ':' || md5(coalesce(qual, '')) ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname='public' AND tablename IN (${tl}, 'customers', 'service_cases')),
      'fn', (SELECT json_agg(proname || ':' || md5(prosrc) ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('my_case_scope_ids','my_customer_scope_ids','my_case_customer_ids','current_employee_id','can_view_case_finance')),
      'idx', (SELECT json_agg(indexname ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename IN ('customer_tasks','work_orders')),
      'col', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_tasks' AND column_name='service_case_id')) f`)).text
  const before = await fingerprint()
  const { fx, cleanup } = await setup240(c)
  try {
    const { loginPersonas } = await import('./role-matrix')
    const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
    const uid: Record<string, string> = {}
    for (const r of ['admin', 'bogholderi']) uid[r] = (await p.get(r as never)!.auth.getUser()).data.user!.id
    const adminUid = uid.admin

    // ---- fixtures (labels → id). Eksisterende arbejdsordrer/opgaver fra setup240
    const L: Record<string, string> = {}
    const id = (k: string) => (L[k] ??= randomUUID())
    const { data: wos } = await c.admin.from('work_orders').select('id, case_id, status').in('customer_id', Object.values(fx.cust))
    for (const w of (wos ?? []) as Array<{ id: string; case_id: string | null; status: string }>) {
      L[w.case_id === fx.cases.wo ? 'wo_mine' : w.status === 'cancelled' ? 'wo_mine_cancelled' : 'wo_mine_nocase'] = w.id
    }
    const { data: tasks } = await c.admin.from('customer_tasks').select('id, customer_id').in('customer_id', Object.values(fx.cust))
    for (const t of (tasks ?? []) as Array<{ id: string; customer_id: string }>) {
      L[t.customer_id === fx.cust.task ? 't_mine_open' : t.customer_id === fx.cust.doneTask ? 't_mine_done' : 't_mine_done2'] = t.id
    }
    const { data: mail } = await c.admin.from('incoming_emails').select('id').limit(1).maybeSingle()
    const mailId = (mail as { id: string } | null)?.id ?? null
    const custKeys = Object.keys(fx.cust) as Array<keyof typeof fx.cust>
    const q = (v: string | null) => (v ? `'${v}'` : 'NULL')
    const ins: string[] = []
    for (const k of custKeys) {
      ins.push(`INSERT INTO public.customer_contacts (id, customer_id, name) VALUES ('${id(`ct_${k}`)}', '${fx.cust[k]}', '[PROBE] 241');`)
      ins.push(`IF to_regclass('public.customer_notes') IS NOT NULL THEN EXECUTE format('INSERT INTO public.customer_notes (id, customer_id, content) VALUES (%L, %L, %L)', '${id(`cn_${k}`)}', '${fx.cust[k]}', '[PROBE] 241'); END IF;`)
    }
    const doc = (k: string, cust: string, cs: string | null, src: string | null = null) =>
      ins.push(`INSERT INTO public.customer_documents (id, customer_id, service_case_id, source_email_id, title, document_type, file_url, file_name) VALUES ('${id(k)}', '${cust}', ${q(cs)}, ${q(src)}, '[PROBE] 241', 'other', 'x', 'x');`)
    doc('d_case_wo', fx.cust.caseCust, fx.cases.wo)
    doc('d_case_hidden', fx.cust.hidden, fx.cases.hidden)
    doc('d_case_d4', fx.cust.salgCase, fx.cases.salgD4)
    doc('d_nocase_caseCust', fx.cust.caseCust, null)
    doc('d_nocase_party', fx.cust.party, null)
    doc('d_nocase_hidden', fx.cust.hidden, null)
    if (mailId) doc('d_mail_wo', fx.cust.caseCust, fx.cases.wo, mailId)
    const roof = (k: string, cust: string, cs: string | null) =>
      ins.push(`INSERT INTO public.roof_drawings (id, customer_id, service_case_id, image_storage_path, image_width, image_height) VALUES ('${id(k)}', '${cust}', ${q(cs)}, 'x', 1, 1);`)
    roof('r_case_wo', fx.cust.caseCust, fx.cases.wo)
    roof('r_case_hidden', fx.cust.hidden, fx.cases.hidden)
    roof('r_nocase_party', fx.cust.party, null)
    roof('r_nocase_hidden', fx.cust.hidden, null)
    const conf = (k: string, d: string, cs: string | null) =>
      ins.push(`INSERT INTO public.document_confirmations (id, customer_document_id, service_case_id, recipient_type, recipient_email, recipient_role, expires_at) VALUES ('${id(k)}', '${L[d]}', ${q(cs)}, 'manual', 'p241@harness.test', 'orderer', now() + interval '1 day');`)
    conf('c_case_wo', 'd_case_wo', fx.cases.wo)
    conf('c_nocase_caseCust', 'd_nocase_caseCust', null)
    conf('c_nocase_party', 'd_nocase_party', null)
    conf('c_nocase_hidden', 'd_nocase_hidden', null)
    const wo = (k: string, cs: string | null, cust: string) =>
      ins.push(`INSERT INTO public.work_orders (id, case_id, customer_id, title, status, scheduled_date) VALUES ('${id(k)}', ${q(cs)}, '${cust}', '[PROBE] 242', 'planned', '2026-10-01');`)
    wo('wo_other_on_my_case', fx.cases.wo, fx.cust.caseCust)
    wo('wo_on_d4', fx.cases.salgD4, fx.cust.salgCase)
    wo('wo_nocase_other', null, fx.cust.hidden)
    const task = (k: string, cust: string, cs: string | null) =>
      ins.push(`INSERT INTO public.customer_tasks (id, customer_id, service_case_id, title, status, assigned_to, created_by) VALUES ('${id(k)}', '${cust}', ${q(cs)}, '[PROBE] 242', 'pending', '${adminUid}', '${adminUid}');`)
    task('t_on_my_case', fx.cust.caseCust, fx.cases.wo)
    task('t_hidden_nocase', fx.cust.hidden, null)
    task('t_on_hidden_case', fx.cust.hidden, fx.cases.hidden)
    const note = (k: string, cs: string) => ins.push(`INSERT INTO public.case_notes (id, case_id, content) VALUES ('${id(k)}', '${cs}', '[PROBE] 242');`)
    note('n_wo', fx.cases.wo); note('n_hidden', fx.cases.hidden); note('n_d4', fx.cases.salgD4)
    const att = (k: string, cs: string) => ins.push(`INSERT INTO public.service_case_attachments (id, service_case_id, file_name, file_url) VALUES ('${id(k)}', '${cs}', 'x', 'x');`)
    att('a_wo', fx.cases.wo); att('a_hidden', fx.cases.hidden); att('a_d4', fx.cases.salgD4)
    const inv = (k: string, cs: string | null) => {
      ins.push(`INSERT INTO public.invoices (id, invoice_number, case_id, customer_id, status, total_amount, tax_amount, final_amount) VALUES ('${id(k)}', 'P242-${fx.stamp}-${k}', ${q(cs)}, '${fx.cust.salgCase}', 'sent', 100, 25, 125);`)
      ins.push(`INSERT INTO public.invoice_lines (id, invoice_id, description) VALUES ('${id(`${k}_line`)}', '${L[k]}', '[PROBE] 242');`)
      ins.push(`INSERT INTO public.invoice_payments (id, invoice_id, amount) VALUES ('${id(`${k}_pay`)}', '${L[k]}', 10);`)
    }
    inv('i_d4', fx.cases.salgD4); inv('i_hidden', fx.cases.hidden); inv('i_nocase', null); inv('i_wo', fx.cases.wo)

    const byTable: Record<(typeof TABLES)[number], string[]> = {
      customer_contacts: custKeys.map((k) => `ct_${k}`), customer_notes: custKeys.map((k) => `cn_${k}`),
      customer_documents: Object.keys(L).filter((k) => k.startsWith('d_')), roof_drawings: Object.keys(L).filter((k) => k.startsWith('r_')),
      document_confirmations: Object.keys(L).filter((k) => k.startsWith('c_')), work_orders: Object.keys(L).filter((k) => k.startsWith('wo_')),
      case_notes: ['n_wo', 'n_hidden', 'n_d4'], service_case_attachments: ['a_wo', 'a_hidden', 'a_d4'],
      customer_tasks: Object.keys(L).filter((k) => k.startsWith('t_')),
      invoices: ['i_d4', 'i_hidden', 'i_nocase', 'i_wo'], invoice_lines: ['i_d4_line', 'i_hidden_line', 'i_nocase_line', 'i_wo_line'],
      invoice_payments: ['i_d4_pay', 'i_hidden_pay', 'i_nocase_pay', 'i_wo_pay'],
    }
    const label = new Map(Object.entries(L).map(([k, v]) => [v, k]))
    const idArr = (t: (typeof TABLES)[number]) => `ARRAY[${byTable[t].map((k) => `'${L[k]}'::uuid`).join(',')}]`
    // customer_notes findes kun på staging (00196) → læses dynamisk i p242
    const visSql = TABLES.filter((t) => t !== 'customer_notes')
      .map((t) => `'${t}', (SELECT coalesce(jsonb_agg(x.id), '[]') FROM public.${t} x WHERE x.id = ANY (${idArr(t)}))`)
      .join(',\n        ')
    const ovRows = (tpl: keyof typeof PERMISSION_TEMPLATES) => templateOverrides(PERMISSION_TEMPLATES[tpl])
      .map((o) => `('${fx.m.uid}', '${o.permission}', '${o.effect}', 'template', 'probe 242')`).join(',')
    const sql = `DO $probe$
DECLARE res jsonb := '{}'::jsonb; t0 timestamptz; ms jsonb := '{}'::jsonb;
BEGIN
  ${ins.join('\n  ')}
  EXECUTE $draft$${draftBodyOf('mp-00240-draft.sql')}$draft$;
  EXECUTE $draft$${draftBodyOf('mp-00241-draft.sql')}$draft$;
  EXECUTE $draft$${draftBodyOf('mp-00242-draft.sql')}$draft$;
  CREATE FUNCTION pg_temp.p242(p_uid uuid, p_anon boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $f$
  DECLARE r jsonb; rn jsonb := '[]'::jsonb; plan jsonb; tm jsonb := '{}'::jsonb;
  BEGIN
    IF p_anon THEN EXECUTE 'SET LOCAL ROLE anon';
    ELSE
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    END IF;
    BEGIN
      r := jsonb_build_object(
        ${visSql});
      IF to_regclass('public.customer_notes') IS NOT NULL THEN
        EXECUTE 'SELECT coalesce(jsonb_agg(id), ''[]'') FROM public.customer_notes WHERE id = ANY ($1)' INTO rn USING ${idArr('customer_notes')};
      END IF;
      r := r || jsonb_build_object('customer_notes', rn);
    EXCEPTION WHEN insufficient_privilege THEN r := jsonb_build_object('denied', SQLSTATE);
    END;
    IF NOT p_anon THEN
      EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM public.customer_documents' INTO plan; tm := tm || jsonb_build_object('docs', plan->0->'Execution Time');
      EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM public.work_orders' INTO plan; tm := tm || jsonb_build_object('wo', plan->0->'Execution Time');
      EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM public.customer_tasks' INTO plan; tm := tm || jsonb_build_object('tasks', plan->0->'Execution Time');
      EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM public.invoices' INTO plan; tm := tm || jsonb_build_object('inv', plan->0->'Execution Time');
      EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM public.customer_contacts' INTO plan; tm := tm || jsonb_build_object('contacts', plan->0->'Execution Time');
      r := r || jsonb_build_object('ms', tm);
    END IF;
    EXECUTE 'RESET ROLE';
    RETURN r;
  END $f$;
  res := res || jsonb_build_object('admin', pg_temp.p242('${uid.admin}'), 'bogholderi', pg_temp.p242('${uid.bogholderi}'),
    'salg', pg_temp.p242('${fx.s.uid}'), 'montor', pg_temp.p242('${fx.m.uid}'));
  INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${ovRows('elektriker')};
  res := res || jsonb_build_object('elektriker', pg_temp.p242('${fx.m.uid}'));
  DELETE FROM public.user_permission_overrides WHERE profile_id = '${fx.m.uid}';
  INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${ovRows('overmontor')};
  res := res || jsonb_build_object('overmontor', pg_temp.p242('${fx.m.uid}'));
  DELETE FROM public.user_permission_overrides WHERE profile_id = '${fx.m.uid}';
  UPDATE public.profiles SET is_active = false WHERE id = '${fx.m.uid}';
  res := res || jsonb_build_object('inaktiv', pg_temp.p242('${fx.m.uid}'), 'anon', pg_temp.p242(NULL, true));
  RAISE EXCEPTION 'P242RESULT%P242END', res::text;
END
$probe$;`
    const r = await c.rawSql(sql)
    const m = r.text.match(/P242RESULT([\s\S]*?)P242END/)
    if (r.ok || !m) {
      add('udkastene kørte i rollback-only-prøven', false, r.ok ? 'blev IKKE afbrudt (!)' : r.text.slice(0, 600))
      return out
    }
    add('00240 + 00241 + 00242 kørte uden fejl i rollback-only-prøven', true)
    type Res = Record<string, Record<string, unknown> & { ms?: Record<string, number> }>
    const res = JSON.parse(m[1].replace(/\\"/g, '"')) as Res
    const vis = (persona: string, t: string) => new Set(((res[persona]?.[t] as string[] | undefined) ?? []).map((x) => label.get(x) ?? x))
    const notesExist = (res.admin.customer_notes as string[]).length > 0
    const chk = (persona: string, t: (typeof TABLES)[number], want: string[]) => {
      if (t === 'customer_notes' && !notesExist) return
      const got = vis(persona, t)
      const w = new Set(want.filter((k) => L[k]))
      const missing = [...w].filter((k) => !got.has(k)), extra = [...got].filter((k) => !w.has(k))
      add(`${persona} · ${t}`, !missing.length && !extra.length, missing.length || extra.length ? `mangler=[${missing}] for meget=[${extra}]` : `${got.size} rækker`)
    }
    const all = (t: (typeof TABLES)[number]) => byTable[t]
    const montorCust = ['own', 'wo', 'party', 'caseCust', 'task']
    // ---- admin / bogholderi: alt (bogholderi har customers.emails.view → også mail-vedhæftningen)
    for (const k of ['admin', 'bogholderi']) for (const t of TABLES) chk(k, t, all(t))
    // ---- montør + Elektriker (samme læse-scope)
    for (const k of ['montor', 'elektriker']) {
      chk(k, 'customer_contacts', montorCust.map((x) => `ct_${x}`))
      chk(k, 'customer_notes', montorCust.map((x) => `cn_${x}`))
      chk(k, 'customer_documents', ['d_case_wo', 'd_nocase_caseCust'])
      chk(k, 'roof_drawings', ['r_case_wo', 'r_nocase_party'])
      chk(k, 'document_confirmations', ['c_case_wo', 'c_nocase_caseCust'])
      chk(k, 'work_orders', ['wo_mine', 'wo_mine_cancelled', 'wo_mine_nocase'])
      chk(k, 'case_notes', ['n_wo'])
      chk(k, 'service_case_attachments', ['a_wo'])
      chk(k, 'customer_tasks', ['t_mine_open', 't_mine_done', 't_mine_done2', 't_on_my_case'])
      for (const t of ['invoices', 'invoice_lines', 'invoice_payments'] as const) chk(k, t, [])
    }
    // ---- Overmontør: alle kunder/sager/ordrer — men ingen mail-vedhæftning (ingen customers.emails.view) og ingen fakturaer
    for (const t of TABLES) {
      if (t === 'customer_documents') chk('overmontor', t, all(t).filter((x) => x !== 'd_mail_wo'))
      else if (t.startsWith('invoice')) chk('overmontor', t, [])
      else chk('overmontor', t, all(t))
    }
    // ---- salg: kunder ALL, sager = egne/D4 → sagsdokumenter/-noter/-ordrer/-fakturaer kun på D4-sagen
    chk('salg', 'customer_contacts', all('customer_contacts'))
    chk('salg', 'customer_notes', all('customer_notes'))
    chk('salg', 'customer_documents', ['d_case_d4', 'd_nocase_caseCust', 'd_nocase_party', 'd_nocase_hidden'])
    chk('salg', 'roof_drawings', ['r_nocase_party', 'r_nocase_hidden'])
    chk('salg', 'document_confirmations', ['c_nocase_caseCust', 'c_nocase_party', 'c_nocase_hidden'])
    chk('salg', 'work_orders', ['wo_on_d4'])
    chk('salg', 'case_notes', ['n_d4'])
    chk('salg', 'service_case_attachments', ['a_d4'])
    chk('salg', 'customer_tasks', all('customer_tasks'))
    chk('salg', 'invoices', ['i_d4']); chk('salg', 'invoice_lines', ['i_d4_line']); chk('salg', 'invoice_payments', ['i_d4_pay'])
    // ---- inaktiv / anon: intet
    for (const k of ['inaktiv', 'anon']) for (const t of TABLES) chk(k, t, [])

    // ---- PARITET dokumenter: DB (montør) == appens customerDocumentReadDenied
    {
      const { customerDocumentReadDenied } = await import('../../src/lib/documents/document-read-access')
      const perms = computeEffectivePermissions('montør', [])
      const ctx = { role: 'montør' as never, userId: fx.m.uid, supabase: fx.m.cl, hasPermission: (q2: Permission) => perms.has(q2) }
      const spec: Record<string, { service_case_id: string | null; customer_id: string; source_email_id?: string | null }> = {
        d_case_wo: { service_case_id: fx.cases.wo, customer_id: fx.cust.caseCust }, d_case_hidden: { service_case_id: fx.cases.hidden, customer_id: fx.cust.hidden },
        d_case_d4: { service_case_id: fx.cases.salgD4, customer_id: fx.cust.salgCase }, d_nocase_caseCust: { service_case_id: null, customer_id: fx.cust.caseCust },
        d_nocase_party: { service_case_id: null, customer_id: fx.cust.party }, d_nocase_hidden: { service_case_id: null, customer_id: fx.cust.hidden },
        ...(mailId ? { d_mail_wo: { service_case_id: fx.cases.wo, customer_id: fx.cust.caseCust, source_email_id: mailId } } : {}),
      }
      const dbVis = vis('montor', 'customer_documents')
      const diff: string[] = []
      for (const [k, d] of Object.entries(spec)) if ((await customerDocumentReadDenied(d, ctx)) === null !== dbVis.has(k)) diff.push(k)
      add('PARITET montør dokumenter: RLS == app (customerDocumentReadDenied)', diff.length === 0, diff.length ? `afvigelser=[${diff}]` : `${Object.keys(spec).length} dokumenter`)
    }
    if (!mailId) add('mail-vedhæftningstest sprunget over (ingen incoming_emails på staging)', true)
    const ms = (k: string) => res[k]?.ms ?? {}
    const worst = Math.max(...['admin', 'salg', 'montor'].flatMap((k) => Object.values(ms(k)).map(Number)))
    add(`YDELSE count(*) pr. tabel — montør ${JSON.stringify(ms('montor'))} · salg ${JSON.stringify(ms('salg'))} · admin ${JSON.stringify(ms('admin'))}`, worst < 300, `værste=${worst.toFixed(1)} ms`)
  } catch (e) {
    add('kørsel uden undtagelse', false, e instanceof Error ? e.message : String(e))
  } finally {
    const left = await cleanup()
    out.push({ id: 'oprydning: ingen testkunder tilbage', ok: left === 0, note: `tilbage=${left}` })
    const after = await fingerprint()
    out.push({ id: 'intet anvendt: politikker/funktioner/indeks/kolonne identiske før/efter', ok: before === after, note: before === after ? '' : `${before.slice(0, 200)} ≠ ${after.slice(0, 200)}` })
  }
  return out
}
