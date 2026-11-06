/**
 * 00248 ukendt materialekost — staging-prøver.
 *   mp-00248-state          (read-only)     kolonner, constraint, funktioner, politikker, grants, md5 af rækkerne
 *   mp-00248-probe          (ROLLBACK-ONLY) ÉN DO-blok der ALTID slutter med RAISE EXCEPTION og derfor efterlader intet
 *   mp-00248-rollback-proof (kun staging)   state → rollback-fil → state → migration → state; rækkerne skal være uændrede
 * Ingen personværdier ud — kun antal, md5 og tjek-resultater.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

type RawSql = (sql: string) => Promise<{ ok: boolean; status: number; text: string }>

const md5Rows = (t: string) => `(SELECT json_build_object('n', count(*), 'md5', md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), ''))) FROM public.${t} x)`

export const STATE_00248_SQL = `SELECT json_build_object(
  'unit_cost', (SELECT json_build_object('nullable', is_nullable, 'default', column_default) FROM information_schema.columns WHERE table_schema='public' AND table_name='case_materials' AND column_name='unit_cost'),
  'total_cost', (SELECT json_build_object('generated', is_generated, 'expr', generation_expression) FROM information_schema.columns WHERE table_schema='public' AND table_name='case_materials' AND column_name='total_cost'),
  'finite_check', (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='case_materials_unit_cost_finite'),
  'wop', (SELECT json_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default,'-') ORDER BY column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name='work_order_profit' AND column_name IN ('material_cost','total_cost','profit','margin_percentage')),
  'fn', (SELECT json_agg(p.proname || ':' || md5(p.prosrc) || ':' || coalesce(array_to_string(p.proacl, ','), '') ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('calculate_work_order_profit','snapshot_work_order_profit')),
  'pol', (SELECT md5(string_agg(policyname || cmd || coalesce(qual,'') || coalesce(with_check,''), '|' ORDER BY policyname)) FROM pg_policies WHERE schemaname='public' AND tablename='case_materials'),
  'grants', (SELECT md5(string_agg(grantee || privilege_type, '|' ORDER BY grantee, privilege_type)) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='case_materials'),
  'col_grants', (SELECT md5(string_agg(grantee || column_name || privilege_type, '|' ORDER BY grantee, column_name, privilege_type)) FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='case_materials' AND column_name IN ('unit_cost','total_cost')),
  'trg', (SELECT md5(string_agg(tgname || pg_get_triggerdef(oid), '|' ORDER BY tgname)) FROM pg_trigger WHERE tgrelid='public.case_materials'::regclass AND NOT tgisinternal),
  'select_cols', (SELECT json_agg(column_name ORDER BY column_name) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='case_materials' AND has_column_privilege('authenticated', 'public.case_materials', c.column_name, 'SELECT')),
  'counts', (SELECT json_build_object('total', count(*), 'zero', count(*) FILTER (WHERE unit_cost = 0), 'nul', count(*) FILTER (WHERE unit_cost IS NULL)) FROM public.case_materials),
  'rows', ${md5Rows('case_materials')},
  'wop_rows', ${md5Rows('work_order_profit')}) f`

/** Guard-blokken fra rollback-filen, så prøven tester den tekst der faktisk køres */
function rollbackGuard(): string {
  const sql = readFileSync(resolve(process.cwd(), 'docs', 'runbooks', 'mp-00248-rollback.sql'), 'utf8').replace(/\r\n/g, '\n')
  const m = /DO \$guard\$[\s\S]*?\$guard\$;/.exec(sql)
  if (!m) throw new Error('rollback-filen har ingen guard')
  return m[0]
}

export function probe00248Sql(): string {
  const guard = rollbackGuard().replace(/'/g, "''")
  return `DO $probe$
DECLARE
  v_admin uuid; v_montor uuid; v_emp uuid; v_cust uuid; v_case uuid; v_wo uuid; v_other_case uuid;
  v_known uuid; v_zero uuid; v_unknown uuid; v_mont uuid;
  r jsonb := '{}'::jsonb;
  c jsonb; n int; x numeric; t numeric; s text; b boolean;
  v_alerts int;
BEGIN
  -- Hjælpefunktion i samme transaktion; den rulles tilbage med resten (blokken slutter altid med RAISE)
  EXECUTE $x$CREATE FUNCTION public.p248_denied(q text) RETURNS boolean LANGUAGE plpgsql AS $f$
    BEGIN EXECUTE q; RETURN false; EXCEPTION WHEN insufficient_privilege THEN RETURN true; END $f$x$;
  EXECUTE $x$GRANT EXECUTE ON FUNCTION public.p248_denied(text) TO authenticated$x$;
  SELECT id INTO v_admin FROM profiles WHERE is_active AND role='admin' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_montor FROM profiles WHERE is_active AND role='montør' ORDER BY created_at LIMIT 1;
  INSERT INTO customers (customer_number, company_name, contact_person, email, created_by)
    VALUES ('P248-' || extract(epoch from now())::bigint, '[PROBE] 00248', 'X', 'p248@harness.test', v_admin) RETURNING id INTO v_cust;
  INSERT INTO service_cases (customer_id, title, status, created_by) VALUES (v_cust, '[PROBE] 00248', 'in_progress', v_admin) RETURNING id INTO v_case;
  INSERT INTO service_cases (customer_id, title, status, created_by) VALUES (v_cust, '[PROBE] 00248 fremmed', 'in_progress', v_admin) RETURNING id INTO v_other_case;
  SELECT id INTO v_emp FROM employees WHERE profile_id = v_montor ORDER BY created_at LIMIT 1;
  IF v_emp IS NULL THEN
    INSERT INTO employees (name, email, role, active, profile_id, hourly_rate, cost_rate) VALUES ('[PROBE] 00248', 'p248e@harness.test', 'montør', true, v_montor, 495, 300) RETURNING id INTO v_emp;
  END IF;
  INSERT INTO work_orders (case_id, customer_id, title, status, scheduled_date, assigned_employee_id) VALUES (v_case, v_cust, '[PROBE] 00248', 'in_progress', current_date, v_emp) RETURNING id INTO v_wo;

  -- 1. kendt kost
  INSERT INTO case_materials (case_id, work_order_id, description, quantity, unit_cost, unit_sales_price, source, created_by)
    VALUES (v_case, v_wo, 'kendt', 2, 10, 15, 'manual', v_admin) RETURNING id INTO v_known;
  SELECT total_cost INTO t FROM case_materials WHERE id = v_known;
  r := r || jsonb_build_object('kendt_total_20', t = 20);

  -- profit uden ukendte linjer
  c := calculate_work_order_profit(v_wo);
  r := r || jsonb_build_object('kendt_profit', (c->>'profit')::numeric = 10 AND (c->>'material_cost')::numeric = 20 AND (c->>'cost_complete')::boolean AND (c->>'margin_percentage')::numeric = 33.33);

  -- 2. rigtig 0
  INSERT INTO case_materials (case_id, work_order_id, description, quantity, unit_cost, unit_sales_price, source, created_by)
    VALUES (v_case, v_wo, 'nul', 3, 0, 5, 'manual', v_admin) RETURNING id INTO v_zero;
  SELECT unit_cost, total_cost INTO x, t FROM case_materials WHERE id = v_zero;
  r := r || jsonb_build_object('nul_er_kendt', x = 0 AND t = 0);
  c := calculate_work_order_profit(v_wo);
  r := r || jsonb_build_object('nul_tael_som_kendt', (c->>'cost_complete')::boolean AND (c->>'material_cost')::numeric = 20 AND (c->>'profit') IS NOT NULL);

  -- 3 + 4. ukendt: uden kolonnen (ingen standard), og antal × NULL = NULL
  INSERT INTO case_materials (case_id, work_order_id, description, quantity, unit_sales_price, source, created_by)
    VALUES (v_case, v_wo, 'ukendt', 4, 25, 'manual', v_admin) RETURNING id INTO v_unknown;
  SELECT unit_cost, total_cost, total_sales_price INTO x, t, c FROM (SELECT unit_cost, total_cost, to_jsonb(total_sales_price) AS total_sales_price FROM case_materials WHERE id = v_unknown) q;
  r := r || jsonb_build_object('ingen_standard_0', x IS NULL, 'antal_gange_null_er_null', t IS NULL, 'salg_kendt_med_ukendt_kost', (c #>> '{}')::numeric = 100);

  -- 10. profit: ukendt, ikke 0. Omsætning og det kendte står.
  c := calculate_work_order_profit(v_wo);
  r := r || jsonb_build_object(
    'profit_ukendt', c->>'profit' IS NULL AND c->>'total_cost' IS NULL AND c->>'material_cost' IS NULL AND c->>'margin_percentage' IS NULL,
    'profit_flag', (c->>'cost_complete')::boolean = false AND (c->>'material_unknown_line_count')::int = 1,
    'profit_kendt_del', (c->>'material_cost_known')::numeric = 20,
    'omsaetning_uberoert', (c->>'revenue')::numeric = 145);

  -- NaN afvises
  BEGIN
    INSERT INTO case_materials (case_id, description, quantity, unit_cost, source) VALUES (v_case, 'nan', 1, 'NaN', 'manual');
    r := r || jsonb_build_object('nan_afvist', false);
  EXCEPTION WHEN check_violation THEN r := r || jsonb_build_object('nan_afvist', true);
  END;

  -- Snapshot på udført ordre med ukendt kost: fejler ikke, gemmer NULL, ingen margin-alarm
  SELECT count(*) INTO v_alerts FROM ai_suggestions WHERE entity_id = v_wo;
  UPDATE work_orders SET status = 'done' WHERE id = v_wo;
  SELECT count(*) INTO n FROM work_order_profit WHERE work_order_id = v_wo AND profit IS NULL AND total_cost IS NULL AND margin_percentage IS NULL AND material_cost IS NULL AND (details->>'cost_complete')::boolean = false;
  r := r || jsonb_build_object('snapshot_ukendt', n = 1);
  SELECT count(*) INTO n FROM ai_suggestions WHERE entity_id = v_wo;
  r := r || jsonb_build_object('ingen_margin_alarm', n = v_alerts);
  SELECT low_profit INTO b FROM work_orders WHERE id = v_wo;
  r := r || jsonb_build_object('intet_lav_avance_flag', b IS NOT TRUE);

  -- Dublet: samme tal → intet nyt snapshot. Ny kendt linje → nyt, selvom totalen stadig er NULL.
  PERFORM snapshot_work_order_profit(v_wo, 'manual');
  SELECT count(*) INTO n FROM work_order_profit WHERE work_order_id = v_wo;
  r := r || jsonb_build_object('ingen_dublet', n = 1);
  INSERT INTO case_materials (case_id, work_order_id, description, quantity, unit_cost, source) VALUES (v_case, v_wo, 'kendt2', 1, 7, 'manual');
  SELECT count(*) INTO n FROM work_order_profit WHERE work_order_id = v_wo;
  r := r || jsonb_build_object('nyt_snapshot_ved_ny_kendt', n = 2);

  -- 15. rettelse: ukendt → kendt gør avancen kendt igen. Kendt → ukendt gør den ukendt.
  UPDATE case_materials SET unit_cost = 5 WHERE id = v_unknown;
  SELECT total_cost INTO t FROM case_materials WHERE id = v_unknown;
  c := calculate_work_order_profit(v_wo);
  r := r || jsonb_build_object('rettelse_total', t = 20, 'rettelse_profit_kendt', (c->>'cost_complete')::boolean AND (c->>'total_cost') IS NOT NULL);
  SELECT count(*) INTO n FROM work_order_profit WHERE work_order_id = v_wo AND profit IS NOT NULL ORDER BY 1;
  r := r || jsonb_build_object('rettelse_snapshot', n >= 1);
  UPDATE case_materials SET unit_cost = NULL WHERE id = v_known;
  SELECT total_cost INTO t FROM case_materials WHERE id = v_known;
  c := calculate_work_order_profit(v_wo);
  r := r || jsonb_build_object('rydning_null', t IS NULL AND c->>'profit' IS NULL);

  -- Rollback-værnet afviser, mens der findes NULL-rækker
  BEGIN
    EXECUTE '${guard}';
    r := r || jsonb_build_object('rollback_afviser_null', false);
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS s = MESSAGE_TEXT;
    r := r || jsonb_build_object('rollback_afviser_null', s LIKE '00248-rollback afvist%');
  END;

  -- Montør (rigtig session): må oprette med NULL, må ikke rette eller slette, ser ikke fremmed sag
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_montor, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO case_materials (case_id, description, quantity, source, created_by) VALUES (v_case, 'montør', 1, 'manual', v_montor) RETURNING id INTO v_mont;
    r := r || jsonb_build_object('montor_opretter_null', v_mont IS NOT NULL);
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('montor_opretter_null', false, 'montor_fejl', SQLERRM);
  END;
  UPDATE case_materials SET unit_cost = 1 WHERE id = v_zero;
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('montor_kan_ikke_rette', n = 0);
  DELETE FROM case_materials WHERE id = v_zero;
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('montor_kan_ikke_slette', n = 0);
  SELECT count(*) INTO n FROM case_materials WHERE case_id = v_other_case;
  r := r || jsonb_build_object('montor_uden_fremmed', n = 0);
  -- Ufarlige kolonner læses som før
  SELECT count(*) INTO n FROM (SELECT id, description, quantity, unit, unit_sales_price, total_sales_price FROM case_materials WHERE case_id = v_case) q;
  r := r || jsonb_build_object('montor_laeser_ufarlige_kolonner', n >= 3);
  -- Kosten kan ikke læses, filtreres, sorteres, tælles eller joines på; SELECT * afvises
  r := r || jsonb_build_object('montor_direkte_kost_afvist', jsonb_build_object(
    'unit_cost',  public.p248_denied('SELECT unit_cost FROM public.case_materials LIMIT 1'),
    'total_cost', public.p248_denied('SELECT total_cost FROM public.case_materials LIMIT 1'),
    'stjerne',    public.p248_denied('SELECT * FROM public.case_materials LIMIT 1'),
    'raekke',     public.p248_denied('SELECT m FROM public.case_materials m LIMIT 1'),
    'filter_null', public.p248_denied('SELECT id FROM public.case_materials WHERE unit_cost IS NULL'),
    'filter_vaerdi', public.p248_denied('SELECT id FROM public.case_materials WHERE total_cost > 0'),
    'sortering',  public.p248_denied('SELECT id FROM public.case_materials ORDER BY unit_cost'),
    'taelling',   public.p248_denied('SELECT count(unit_cost) FROM public.case_materials'),
    'join',       public.p248_denied('SELECT s.id FROM public.service_cases s JOIN public.case_materials m ON m.case_id = s.id AND m.total_cost IS NOT NULL'),
    'json',       public.p248_denied('SELECT to_jsonb(m) FROM public.case_materials m LIMIT 1')));
  EXECUTE 'RESET ROLE';

  -- Også en admin-session kan ikke læse kosten direkte (kun app'en via admin-klienten bag ret)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('admin_session_direkte_afvist', public.p248_denied('SELECT unit_cost FROM public.case_materials LIMIT 1'));
  SELECT count(*) INTO n FROM (SELECT id, description FROM case_materials WHERE case_id = v_case) q;
  r := r || jsonb_build_object('admin_session_ufarlige_kolonner', n >= 3);
  EXECUTE 'RESET ROLE';

  -- 15. sletning af ukendt linje: nyt snapshot, ingen fejl
  DELETE FROM case_materials WHERE id = v_unknown;
  GET DIAGNOSTICS n = ROW_COUNT;
  r := r || jsonb_build_object('sletning', n = 1);

  RAISE EXCEPTION 'PROBE_RESULT:%', r::text;
END
$probe$;`
}

export interface Check00248 { id: string; ok: boolean; note?: string }

export async function runProbe00248(rawSql: RawSql): Promise<Check00248[]> {
  const res = await rawSql(probe00248Sql())
  const m = /PROBE_RESULT:(\{.*?\})(?:"|\\n|$)/s.exec(res.text.replace(/\\"/g, '"'))
  if (!m) return [{ id: 'prøven kørte', ok: false, note: res.text.slice(0, 600) }]
  const r = JSON.parse(m[1]) as Record<string, unknown>
  const out: Check00248[] = []
  for (const [id, v] of Object.entries(r)) {
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) out.push({ id: `${id}.${k}`, ok: x === true })
    else out.push({ id, ok: v === true, note: id === 'montor_fejl' ? String(v) : undefined })
  }
  return out
}

export function rollback00248Sql(): string {
  return readFileSync(resolve(process.cwd(), 'docs', 'runbooks', 'mp-00248-rollback.sql'), 'utf8')
}
export function migration00248Sql(): string {
  return readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '00248_case_material_unknown_cost.sql'), 'utf8')
}
