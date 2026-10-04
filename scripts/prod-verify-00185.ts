/**
 * PRODUCTION read-only: verifikation af 00185 (N2 — godkendelse af timer).
 *   npx tsx scripts/prod-verify-00185.ts pre   — forventet før: ingen godkendelseskolonner/trigger/funktion på time_logs
 *   npx tsx scripts/prod-verify-00185.ts post  — forventet efter: 4 kolonner (approval_status NOT NULL default 'pending'),
 *        CHECK-constraint, delvist indeks, guard-funktion uden EXECUTE for PUBLIC/anon/authenticated, BEFORE INSERT OR
 *        UPDATE-trigger, og alle rækker fra før migrationen backfillet til 'approved' (ingen kø af gamle timer)
 * Én SELECT pr. kald (withProdReadOnly). Afviger noget -> exitCode 1.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const phase = process.argv[2]
if (phase !== 'pre' && phase !== 'post') { console.error('brug: pre|post'); process.exit(2) }

const COLS = ['approval_status', 'approved_by', 'approved_at', 'rejection_reason']

withProdReadOnly(`prod-verify-00185 ${phase}`, async (run) => {
  const row = (await run(`SELECT json_build_object(
    'cols', (SELECT json_agg(json_build_object('name', column_name, 'nullable', is_nullable, 'default', column_default) ORDER BY column_name)
             FROM information_schema.columns WHERE table_schema='public' AND table_name='time_logs' AND column_name IN (${COLS.map((c) => `'${c}'`).join(',')})),
    'check', (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='time_logs_approval_status_check'),
    'idx', (SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='idx_time_logs_approval_pending'),
    'fn', (SELECT json_build_object('config', p.proconfig::text,
             'public_exec', has_function_privilege('public', p.oid, 'EXECUTE'),
             'anon_exec', has_function_privilege('anon', p.oid, 'EXECUTE'),
             'auth_exec', has_function_privilege('authenticated', p.oid, 'EXECUTE'))
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='time_logs_approval_guard'),
    'trigger', (SELECT json_build_object('enabled', t.tgenabled, 'def', pg_get_triggerdef(t.oid)) FROM pg_trigger t
                WHERE t.tgrelid='public.time_logs'::regclass AND t.tgname='trg_time_logs_approval_guard'),
    'triggers_all', (SELECT json_agg(tgname ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.time_logs'::regclass AND NOT tgisinternal),
    'logs_total', (SELECT count(*)::int FROM time_logs),
    'logs_open', (SELECT count(*)::int FROM time_logs WHERE end_time IS NULL),
    'status_counts', (SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='time_logs' AND column_name='approval_status')
                      THEN (SELECT json_object_agg(s, n) FROM (SELECT (to_jsonb(t)->>'approval_status') s, count(*)::int n FROM time_logs t GROUP BY 1) x) ELSE NULL END)
  ) r`))[0].r as Record<string, any>

  const fails: string[] = []
  const cols = (row.cols ?? []) as Array<{ name: string; nullable: string; default: string | null }>
  if (phase === 'pre') {
    if (cols.length) fails.push(`godkendelseskolonner findes allerede: ${cols.map((c) => c.name).join(', ')}`)
    if (row.check) fails.push('CHECK-constraint findes allerede')
    if (row.fn) fails.push('time_logs_approval_guard findes allerede')
    if (row.trigger) fails.push('trg_time_logs_approval_guard findes allerede')
  } else {
    for (const c of COLS) if (!cols.some((x) => x.name === c)) fails.push(`kolonne mangler: ${c}`)
    const st = cols.find((c) => c.name === 'approval_status')
    if (st && (st.nullable !== 'NO' || !/'pending'/.test(st.default ?? ''))) fails.push(`approval_status: forventede NOT NULL default 'pending' — ${JSON.stringify(st)}`)
    if (!/approval_status/.test(row.check ?? '') || !/'rejected'/.test(row.check ?? '')) fails.push(`CHECK-constraint: ${row.check}`)
    if (!/WHERE \(?approval_status = 'pending'/.test(row.idx ?? '')) fails.push(`delvist indeks: ${row.idx}`)
    if (!row.fn) fails.push('time_logs_approval_guard mangler')
    else {
      if (!/search_path/.test(row.fn.config ?? '')) fails.push('guard mangler låst search_path')
      if (row.fn.public_exec || row.fn.anon_exec || row.fn.auth_exec) fails.push(`guard kan kaldes direkte: ${JSON.stringify(row.fn)}`)
    }
    if (!row.trigger || !/BEFORE INSERT OR UPDATE/.test(row.trigger.def ?? '') || row.trigger.enabled === 'D') fails.push(`trigger: ${JSON.stringify(row.trigger)}`)
    // backfill: rækker fra før migrationen er 'approved'; kun nye registreringer (efter kørslen) må være 'pending'
    const sc = (row.status_counts ?? {}) as Record<string, number>
    if (!(sc.approved > 0) && row.logs_total > 0) fails.push(`backfill: ingen 'approved'-rækker (${JSON.stringify(sc)})`)
    if ((sc.pending ?? 0) > Math.max(5, Math.ceil(row.logs_total * 0.02))) fails.push(`backfill: for mange 'pending' (${sc.pending}) — gamle timer i kø?`)
  }
  console.log(JSON.stringify({ phase, cols: cols.map((c) => c.name), trigger: !!row.trigger, triggers_all: row.triggers_all, logs_total: row.logs_total, logs_open: row.logs_open, status_counts: row.status_counts }))
  if (fails.length) { console.log(`❌ ${phase}: ${fails.length} afvigelse(r)\n  - ${fails.join('\n  - ')}`); process.exitCode = 1 }
  else console.log(`✅ ${phase}: som forventet`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
