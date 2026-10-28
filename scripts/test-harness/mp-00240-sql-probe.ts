/**
 * MP-00240 SQL-UDKAST — ROLLBACK-ONLY prøve på staging (intet anvendes):
 *   docs/runbooks/mp-00240-draft.sql køres inde i ÉN DO-blok, der ALTID slutter med RAISE EXCEPTION (= hele
 *   transaktionen rulles tilbage); resultaterne returneres i fejlteksten. Før/efter kontrolleres at politikker,
 *   hjælpere og katalog er UÆNDREDE.
 * Måler pr. persona (rigtige uid'er, SET LOCAL ROLE authenticated + request.jwt.claims) på de samme fixtures som
 * mp-00240-scope-check:
 *   - synlige fixture-kunder/-sager  == app-motorens scope (PARITET app ↔ RLS)
 *   - total count(*) for begrænsede personaer == størrelsen af deres scope (ingen tælle-læk)
 *   - INSERT … RETURNING af egen kunde/sag (Elektriker) virker; inaktiv/manglende profil/anon = intet
 *   - EXPLAIN ANALYZE-tid for montør (count over kunder/sager)
 *   npx tsx scripts/test-harness/cli.ts mp-00240-sql-probe
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

/** Udkastets krop mellem BEGIN; og NOTIFY (uden transaktionskontrol) */
export function draftBody(): string {
  const sql = readFileSync(resolve(process.cwd(), 'docs', 'runbooks', 'mp-00240-draft.sql'), 'utf8').replace(/\r\n/g, '\n')
  const a = sql.indexOf('\nBEGIN;\n'), b = sql.indexOf("\nNOTIFY pgrst, 'reload schema';")
  if (a < 0 || b < a) throw new Error('udkastet har ikke BEGIN; … NOTIFY')
  const body = sql.slice(a + '\nBEGIN;\n'.length, b)
  if (/\b(COMMIT|ROLLBACK)\b/i.test(body.replace(/--.*$/gm, ''))) throw new Error('transaktionskontrol i udkastets krop')
  return body
}

export async function runMp00240SqlProbe(c: { admin: SupabaseClient; url: string; anonKey: string; rawSql: RawSql }): Promise<M240Check[]> {
  const out: M240Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const fingerprint = async () => {
    const r = await c.rawSql(`SELECT json_build_object(
      'pol', (SELECT json_agg(policyname || ':' || cmd ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename IN ('customers','service_cases')),
      'fn', (SELECT count(*) FROM pg_proc WHERE proname IN ('my_case_scope_ids','my_customer_scope_ids')),
      'cat', (SELECT count(*) FROM permission_catalog WHERE permission='customers.view.all'),
      'idx', (SELECT count(*) FROM pg_indexes WHERE indexname IN ('idx_service_cases_created_by','idx_customers_created_by','idx_work_orders_customer_id'))) f`)
    return r.text
  }
  const before = await fingerprint()
  const { appliedScopeStages } = await import('./mp-00241-00242-sql-probe')
  const applied240 = (await appliedScopeStages(c.rawSql)).s240
  add(`00240 anvendt på staging før prøven: ${applied240 ? 'ja (post-check: udkastet køres ikke igen)' : 'nej (udkastet køres og rulles tilbage)'}`, true)
  const { fx, cleanup } = await setup240(c)
  try {
    const { loginPersonas } = await import('./role-matrix')
    const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
    const uid: Record<string, string> = {}
    for (const r of ['admin', 'serviceleder', 'bogholderi', 'salg']) uid[r] = (await p.get(r as never)!.auth.getUser()).data.user!.id

    // App-motorens forventning (samme regler, før 00240) for de begrænsede personaer
    const { getCaseScope } = await import('../../src/lib/auth/case-scope')
    const { getCustomerScope } = await import('../../src/lib/auth/customer-scope')
    const fixCust = Object.values(fx.cust), fixCases = Object.values(fx.cases)
    const appSets = async (role: string, u: string, cl: SupabaseClient, perms: ReadonlySet<Permission>) => {
      const ctx = { role: role as never, userId: u, supabase: cl, hasPermission: (q: Permission) => perms.has(q) }
      const cs = await getCustomerScope(ctx), ks = await getCaseScope(ctx)
      return {
        cust: cs.type === 'all' ? [...fixCust].sort() : cs.customerIds.filter((x) => fixCust.includes(x)).sort(),
        cases: ks.type === 'all' ? [...fixCases].sort() : ks.caseIds.filter((x) => fixCases.includes(x)).sort(),
      }
    }
    const eff = (role: string, tpl?: keyof typeof PERMISSION_TEMPLATES) => computeEffectivePermissions(role, tpl ? templateOverrides(PERMISSION_TEMPLATES[tpl]) : [])
    const expect: Record<string, { cust: string[]; cases: string[] }> = {
      montor: await appSets('montør', fx.m.uid, fx.m.cl, eff('montør')),
      elektriker: await appSets('montør', fx.m.uid, fx.m.cl, eff('montør', 'elektriker')),
      overmontor: await appSets('montør', fx.m.uid, fx.m.cl, eff('montør', 'overmontor')),
      salgtemp: await appSets('salg', fx.s.uid, fx.s.cl, eff('salg')),
    }

    const lit = (ids: string[]) => `ARRAY[${ids.map((x) => `'${x}'::uuid`).join(',')}]`
    const ovRows = (tpl: keyof typeof PERMISSION_TEMPLATES) => templateOverrides(PERMISSION_TEMPLATES[tpl])
      .map((o) => `('${fx.m.uid}', '${o.permission}', '${o.effect}', 'template', 'probe 240')`).join(',')
    const ghost = randomUUID()
    const sql = `DO $probe$
DECLARE res jsonb := '{}'::jsonb;
BEGIN
  ${applied240 ? '-- 00240 allerede anvendt' : `EXECUTE $draft$${draftBody()}$draft$;`}
  CREATE FUNCTION pg_temp.p240(p_uid uuid, p_anon boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql AS $f$
  DECLARE r jsonb; plan jsonb; ins jsonb := '{}'::jsonb; x uuid;
  BEGIN
    IF p_anon THEN EXECUTE 'SET LOCAL ROLE anon';
    ELSE
      EXECUTE 'SET LOCAL ROLE authenticated';
      PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    END IF;
    IF p_anon THEN
      BEGIN
        r := jsonb_build_object('ncust', (SELECT count(*) FROM public.customers), 'ncases', (SELECT count(*) FROM public.service_cases), 'cust', '[]'::jsonb, 'cases', '[]'::jsonb);
      EXCEPTION WHEN insufficient_privilege THEN
        r := jsonb_build_object('ncust', 0, 'ncases', 0, 'cust', '[]'::jsonb, 'cases', '[]'::jsonb, 'denied', SQLSTATE);
      END;
      EXECUTE 'RESET ROLE';
      RETURN r;
    END IF;
    r := jsonb_build_object(
      'cust', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.customers WHERE id = ANY (${lit(fixCust)})),
      'cases', (SELECT coalesce(jsonb_agg(id ORDER BY id), '[]') FROM public.service_cases WHERE id = ANY (${lit(fixCases)})),
      'ncust', (SELECT count(*) FROM public.customers),
      'ncases', (SELECT count(*) FROM public.service_cases));
    IF NOT p_anon THEN
      r := r || jsonb_build_object('scope_cust', coalesce(array_length(public.my_customer_scope_ids(), 1), 0),
                                   'scope_cases', coalesce(array_length(public.my_case_scope_ids(), 1), 0));
      EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM public.customers' INTO plan;
      r := r || jsonb_build_object('ms_cust', plan->0->'Execution Time');
      EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM public.service_cases' INTO plan;
      r := r || jsonb_build_object('ms_cases', plan->0->'Execution Time');
      BEGIN
        INSERT INTO public.customers (customer_number, company_name, contact_person, email, created_by)
          VALUES ('P240-' || substr(md5(random()::text), 1, 10), '[PROBE] 240', 'R', 'p240@harness.test', p_uid) RETURNING id INTO x;
        ins := ins || jsonb_build_object('cust_returning', x IS NOT NULL);
      EXCEPTION WHEN others THEN ins := ins || jsonb_build_object('cust_returning', SQLSTATE);
      END;
      BEGIN
        INSERT INTO public.service_cases (title, created_by) VALUES ('[PROBE] 240', p_uid) RETURNING id INTO x;
        ins := ins || jsonb_build_object('case_returning', x IS NOT NULL);
      EXCEPTION WHEN others THEN ins := ins || jsonb_build_object('case_returning', SQLSTATE);
      END;
      r := r || ins;
    END IF;
    EXECUTE 'RESET ROLE';
    RETURN r;
  END $f$;
  res := res || jsonb_build_object('admin', pg_temp.p240('${uid.admin}'), 'serviceleder', pg_temp.p240('${uid.serviceleder}'),
    'bogholderi', pg_temp.p240('${uid.bogholderi}'), 'salg', pg_temp.p240('${uid.salg}'), 'salgtemp', pg_temp.p240('${fx.s.uid}'),
    'montor', pg_temp.p240('${fx.m.uid}'));
  INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${ovRows('elektriker')};
  res := res || jsonb_build_object('elektriker', pg_temp.p240('${fx.m.uid}'));
  DELETE FROM public.user_permission_overrides WHERE profile_id = '${fx.m.uid}';
  INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ${ovRows('overmontor')};
  res := res || jsonb_build_object('overmontor', pg_temp.p240('${fx.m.uid}'));
  INSERT INTO public.user_permission_overrides (profile_id, permission, effect, source, reason) VALUES ('${fx.s.uid}', 'customers.view.all', 'revoke', 'manual', 'probe 240');
  res := res || jsonb_build_object('salg_revoke_all', pg_temp.p240('${fx.s.uid}'));
  UPDATE public.profiles SET is_active = false WHERE id = '${fx.m.uid}';
  res := res || jsonb_build_object('inaktiv', pg_temp.p240('${fx.m.uid}'));
  res := res || jsonb_build_object('manglende', pg_temp.p240('${ghost}'), 'anon', pg_temp.p240(NULL, true));
  RAISE EXCEPTION 'P240RESULT%P240END', res::text;
END
$probe$;`
    const r = await c.rawSql(sql)
    const m = r.text.match(/P240RESULT([\s\S]*?)P240END/)
    if (r.ok || !m) {
      add('udkastet kørte i rollback-only-prøven', false, r.ok ? 'blev IKKE afbrudt (!)' : r.text.slice(0, 400))
      return out
    }
    add('udkastet kørte uden fejl i rollback-only-prøven', true)
    const res = JSON.parse(m[1].replace(/\\"/g, '"')) as Record<string, { cust: string[]; cases: string[]; ncust: number; ncases: number; scope_cust?: number; scope_cases?: number; ms_cust?: number; ms_cases?: number; cust_returning?: unknown; case_returning?: unknown }>
    const same = (a: string[], b: string[]) => [...a].sort().join(',') === [...b].sort().join(',')
    const allCust = [...fixCust].sort(), allCases = [...fixCases].sort()
    for (const k of ['admin', 'serviceleder', 'bogholderi']) add(`DB ${k}: alle fixture-kunder + -sager`, same(res[k].cust, allCust) && same(res[k].cases, allCases))
    add('DB salg (persona): alle kunder', same(res.salg.cust, allCust))
    add('DB salg (persona): ingen fremmede fixture-sager (kun egne)', res.salg.cases.length === 0, `sager=${res.salg.cases.length}`)
    for (const k of ['montor', 'elektriker', 'overmontor', 'salgtemp']) {
      add(`PARITET ${k}: DB-kunder == app-scope`, same(res[k].cust, expect[k].cust), `db=${res[k].cust.length} app=${expect[k].cust.length}`)
      add(`PARITET ${k}: DB-sager == app-scope`, same(res[k].cases, expect[k].cases), `db=${res[k].cases.length} app=${expect[k].cases.length}`)
    }
    for (const k of ['montor', 'elektriker']) {
      add(`TÆLLING ${k}: count(*) kunder/sager == eget scope (ingen læk) — ${res[k].ncust}/${res[k].ncases}`,
        res[k].ncust === res[k].scope_cust && res[k].ncases === res[k].scope_cases && res[k].ncust < res.admin.ncust)
    }
    add('INSERT RETURNING: montør (ingen opret-ret) nægtet', res.montor.cust_returning !== true && res.montor.case_returning !== true, `${res.montor.cust_returning}/${res.montor.case_returning}`)
    add('INSERT RETURNING: Elektriker opretter egen kunde + sag og får rækken tilbage', res.elektriker.cust_returning === true && res.elektriker.case_returning === true, `${res.elektriker.cust_returning}/${res.elektriker.case_returning}`)
    add('INSERT RETURNING: salg (persona) egen kunde + sag', res.salg.cust_returning === true && res.salg.case_returning === true)
    add('Overmontør-skabelon: alle kunder + sager (efter katalog-nøglen)', same(res.overmontor.cust, allCust) && same(res.overmontor.cases, allCases))
    add('salg med REVOKE customers.view.all: kun egne/relaterede kunder', res.salg_revoke_all.cust.length === 1 && res.salg_revoke_all.cust[0] === fx.cust.salgCase, `kunder=${res.salg_revoke_all.cust.length}`)
    for (const k of ['inaktiv', 'manglende', 'anon']) add(`${k}: 0 kunder / 0 sager (også totalt)`, res[k].ncust === 0 && res[k].ncases === 0)
    add(`YDELSE montør: count(*) ${Number(res.montor.ms_cust).toFixed(1)} ms kunder / ${Number(res.montor.ms_cases).toFixed(1)} ms sager; salg ${Number(res.salgtemp.ms_cases).toFixed(1)} ms sager; admin ${Number(res.admin.ms_cust).toFixed(1)} ms`,
      Number(res.montor.ms_cust) < 200 && Number(res.montor.ms_cases) < 200 && Number(res.admin.ms_cust) < 200)
  } catch (e) {
    add('kørsel uden undtagelse', false, e instanceof Error ? e.message : String(e))
  } finally {
    const left = await cleanup()
    out.push({ id: 'oprydning: ingen testkunder tilbage', ok: left === 0, note: `tilbage=${left}` })
    const after = await fingerprint()
    out.push({ id: 'intet anvendt: politikker/hjælpere/katalog/indeks identiske før/efter', ok: before === after, note: before === after ? '' : `${before} ≠ ${after}` })
  }
  return out
}
