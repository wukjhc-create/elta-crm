/**
 * Pilot-sessionstjek (Henrik 2026-10-30) — fælles for prod (scripts/prod-pilot-session-check.ts, STRENGT READ-ONLY) og
 * staging (`cli.ts pilot-session-check`, så logikken kan afprøves mod harness-data). Kun SELECT; ingen persondata ud.
 */
type Row = Record<string, any>

export function sinceSql(argv: string[] = process.argv.slice(2)): { sql: string; label: string } {
  const a = argv
  const i = a.indexOf('--since')
  if (i >= 0) {
    const d = a[i + 1] ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('--since kræver YYYY-MM-DD')
    return { sql: `(timestamp '${d} 00:00' AT TIME ZONE 'Europe/Copenhagen')`, label: `siden ${d} 00:00 (dansk tid)` }
  }
  const h = a.indexOf('--hours') >= 0 ? Number(a[a.indexOf('--hours') + 1]) : 24
  if (!Number.isInteger(h) || h < 1 || h > 24 * 60) throw new Error('--hours skal være et heltal 1–1440')
  return { sql: `(now() - interval '${h} hours')`, label: `sidste ${h} timer` }
}

const short = (id: unknown) => (id ? String(id).slice(0, 8) : '—')

/** Returnerer antal fund (❌). `S` er et SQL-udtryk for periodens start. */
export async function runPilotSessionCheck(run: (sql: string) => Promise<any[]>, target: string, S: string, label: string): Promise<number> {
  let problems = 0
  const section = (title: string, rows: Row[], isProblem = true, empty = 'ingen') => {
    console.log(`\n${rows.length && isProblem ? '❌' : rows.length ? 'ℹ' : '✅'} ${title}: ${rows.length ? rows.length : empty}`)
    if (rows.length) console.table(rows.slice(0, 25))
    if (rows.length > 25) console.log(`   … ${rows.length - 25} flere`)
    if (isProblem) problems += rows.length
  }

  // P-numre som prod-pilot-readiness (aktive profiler, sorteret efter rolle + oprettelse)
  const profiles = (await run(`SELECT p.id, p.role::text role, p.is_active FROM public.profiles p ORDER BY p.role, p.created_at`)) as Row[]
  const label_ = new Map<string, string>()
  profiles.filter((p) => p.is_active).forEach((p, i) => label_.set(String(p.id), `P${i + 1} (${p.role})`))
  profiles.filter((p) => !p.is_active).forEach((p, i) => label_.set(String(p.id), `inaktiv${i + 1} (${p.role})`))
  const who = (pid: unknown) => (pid ? label_.get(String(pid)) ?? 'ukendt profil' : '—')
  const emps = (await run(`SELECT id, profile_id, active, (hourly_rate IS NOT NULL) sale, (cost_rate IS NOT NULL) cost FROM public.employees`)) as Row[]
  const empWho = (eid: unknown) => {
    const e = emps.find((x) => x.id === eid)
    return e ? (e.profile_id ? who(e.profile_id) : 'medarbejder uden login') : 'ukendt medarbejder'
  }

  console.log(`--- pilot-sessionstjek @ ${target} — ${label} ---`)

  // 1. Hvad blev brugt (aktivitet pr. person)
  const act = (await run(`SELECT actor, kind, count(*)::int n FROM (
      SELECT e.profile_id actor, 'timer registreret' kind FROM public.time_logs t JOIN public.employees e ON e.id = t.employee_id WHERE t.created_at >= ${S}
      UNION ALL SELECT w2.pid, 'AO afsluttet' FROM (SELECT e.profile_id pid FROM public.work_orders w JOIN public.employees e ON e.id = w.assigned_employee_id WHERE w.status = 'done' AND w.completed_at >= ${S}) w2
      UNION ALL SELECT created_by, 'materiale tilføjet' FROM public.case_materials WHERE created_at >= ${S}
      UNION ALL SELECT shared_by, 'dokument uploadet' FROM public.customer_documents WHERE created_at >= ${S}
      UNION ALL SELECT uploaded_by, 'afleveringsfoto' FROM public.service_case_attachments WHERE created_at >= ${S}
      UNION ALL SELECT assigned_to, 'opgave udført' FROM public.customer_tasks WHERE status = 'done' AND completed_at >= ${S}
      UNION ALL SELECT user_id, 'audit: ' || action FROM public.audit_logs WHERE created_at >= ${S} AND entity_type IN ('service_case', 'work_order', 'time_log', 'case_material')
    ) x GROUP BY actor, kind ORDER BY actor, kind`)) as Row[]
  section('Aktivitet (hvad blev brugt)', act.map((r) => ({ person: who(r.actor), handling: r.kind, antal: Number(r.n) })), false, 'ingen aktivitet i perioden')

  // 2. Mislykkede handlinger + rettighedsafvisninger + klientcrash
  const fails = (await run(`SELECT created_at, metadata->>'action' action, metadata->>'reason' reason, metadata->>'message' message,
      metadata->>'user_id' user_id, metadata->>'entity_id' entity_id FROM public.system_health_log
      WHERE service = 'user_action' AND created_at >= ${S} ORDER BY created_at`)) as Row[]
  const fmtTime = (d: unknown) => new Date(String(d)).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' })
  const failRows = fails.map((f) => ({ tid: fmtTime(f.created_at), person: who(f.user_id), handling: f.action, klasse: f.reason, entitet: short(f.entity_id), tekst: String(f.message ?? '').slice(0, 90) }))
  section('Mislykkede handlinger (alle klasser)', failRows.filter((f) => f.klasse !== 'permission'))
  section('Rettighedsafvisninger', failRows.filter((f) => f.klasse === 'permission'))
  const crashes = (await run(`SELECT created_at, message, metadata->>'user_id' user_id, metadata->>'digest' digest FROM public.system_health_log
      WHERE service = 'ui' AND status = 'error' AND created_at >= ${S} ORDER BY created_at`)) as Row[]
  section('Klientcrash (fejlside vist)', crashes.map((c) => ({ tid: fmtTime(c.created_at), person: who(c.user_id), side: String(c.message ?? '').replace('Klientfejl på ', '').slice(0, 60), digest: c.digest ?? '—' })))

  // 3. Forældreløse / ufuldstændige timer
  const orphan = (await run(`SELECT t.id, t.created_at, t.employee_id, t.work_order_id,
      CASE WHEN t.work_order_id IS NULL THEN 'ingen AO'
           WHEN w.id IS NULL THEN 'AO findes ikke'
           WHEN e.id IS NULL THEN 'medarbejder findes ikke'
           WHEN t.end_time IS NULL AND t.start_time < now() - interval '12 hours' THEN 'timer kører stadig (>12 t)'
           WHEN t.end_time IS NOT NULL AND coalesce(t.hours, 0) <= 0 THEN '0 timer'
           WHEN t.end_time IS NOT NULL AND (t.sale_rate_snapshot IS NULL OR t.cost_rate_snapshot IS NULL) THEN 'mangler sats-snapshot'
      END problem
    FROM public.time_logs t LEFT JOIN public.work_orders w ON w.id = t.work_order_id LEFT JOIN public.employees e ON e.id = t.employee_id
    WHERE t.created_at >= ${S} OR (t.end_time IS NULL AND t.start_time < now() - interval '12 hours')`)) as Row[]
  section('Forældreløse/ufuldstændige timer', orphan.filter((r) => r.problem).map((r) => ({ tid: fmtTime(r.created_at), person: empWho(r.employee_id), time: short(r.id), ao: short(r.work_order_id), problem: r.problem })))

  // 4. Timer på forkert AO
  const wrongWo = (await run(`SELECT t.id, t.employee_id, w.id wo, sc.case_number, w.status, w.assigned_employee_id,
      (t.start_time AT TIME ZONE 'Europe/Copenhagen')::date log_date, w.scheduled_date,
      CASE WHEN w.status = 'cancelled' THEN 'AO er annulleret'
           WHEN w.assigned_employee_id IS DISTINCT FROM t.employee_id THEN 'AO er tildelt en anden'
           WHEN w.scheduled_date IS NOT NULL AND abs((t.start_time AT TIME ZONE 'Europe/Copenhagen')::date - w.scheduled_date) > 7 THEN 'dato >7 dage fra AO-planlægning (info)'
      END problem
    FROM public.time_logs t JOIN public.work_orders w ON w.id = t.work_order_id LEFT JOIN public.service_cases sc ON sc.id = w.case_id
    WHERE t.created_at >= ${S}`)) as Row[]
  const ww = wrongWo.filter((r) => r.problem)
  section('Timer på forkert/tvivlsom AO', ww.filter((r) => !String(r.problem).includes('(info)')).map((r) => ({ person: empWho(r.employee_id), time: short(r.id), sag: r.case_number ?? '—', ao: short(r.wo), problem: r.problem })))
  section('Timer langt fra AO-dato (info)', ww.filter((r) => String(r.problem).includes('(info)')).map((r) => ({ person: empWho(r.employee_id), sag: r.case_number ?? '—', ao: short(r.wo) })), false)

  // 5. Materialer på forkert sag
  const mats = (await run(`SELECT m.id, m.created_by, sc.case_number, m.work_order_id,
      CASE WHEN sc.id IS NULL THEN 'sag findes ikke'
           WHEN m.work_order_id IS NOT NULL AND w.id IS NULL THEN 'AO findes ikke'
           WHEN w.id IS NOT NULL AND w.case_id IS DISTINCT FROM m.case_id THEN 'AO hører til en anden sag'
           WHEN coalesce(m.quantity, 0) <= 0 THEN 'antal ≤ 0'
           WHEN p.role::text = 'montør' AND NOT EXISTS (SELECT 1 FROM public.work_orders w2 JOIN public.employees e2 ON e2.id = w2.assigned_employee_id
                WHERE w2.case_id = m.case_id AND e2.profile_id = m.created_by) THEN 'montør uden AO på sagen'
      END problem
    FROM public.case_materials m LEFT JOIN public.service_cases sc ON sc.id = m.case_id LEFT JOIN public.work_orders w ON w.id = m.work_order_id
    LEFT JOIN public.profiles p ON p.id = m.created_by
    WHERE m.created_at >= ${S}`)) as Row[]
  section('Materialer på forkert sag/AO', mats.filter((r) => r.problem).map((r) => ({ person: who(r.created_by), materiale: short(r.id), sag: r.case_number ?? '—', ao: short(r.work_order_id), problem: r.problem })))

  // 6. Dokument-/billedfejl (fil mangler i storage, 0 bytes, forkert kunde)
  const docs = (await run(`SELECT 'dokument' kind, d.id, d.shared_by who, sc.case_number,
      CASE WHEN d.storage_path IS NULL AND d.file_url IS NULL THEN 'ingen fil-reference'
           WHEN d.storage_path IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.name = d.storage_path) THEN 'fil mangler i storage'
           WHEN coalesce(d.file_size, 1) <= 0 THEN '0 bytes'
           WHEN sc.id IS NOT NULL AND sc.customer_id IS DISTINCT FROM d.customer_id THEN 'sagen tilhører en anden kunde'
      END problem
    FROM public.customer_documents d LEFT JOIN public.service_cases sc ON sc.id = d.service_case_id WHERE d.created_at >= ${S}
    UNION ALL
    SELECT 'afleveringsfoto', a.id, a.uploaded_by, sc.case_number,
      CASE WHEN a.storage_path IS NULL AND a.file_url IS NULL THEN 'ingen fil-reference'
           WHEN a.storage_path IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.name = a.storage_path) THEN 'fil mangler i storage'
           WHEN coalesce(a.file_size, 1) <= 0 THEN '0 bytes'
      END
    FROM public.service_case_attachments a LEFT JOIN public.service_cases sc ON sc.id = a.service_case_id WHERE a.created_at >= ${S}`)) as Row[]
  section('Dokument-/billedfejl', docs.filter((r) => r.problem).map((r) => ({ type: r.kind, person: who(r.who), fil: short(r.id), sag: r.case_number ?? '—', problem: r.problem })))

  // 7. Opgavefejl
  const tasks = (await run(`SELECT t.id, t.assigned_to, sc.case_number,
      CASE WHEN sc.id IS NOT NULL AND sc.customer_id IS DISTINCT FROM t.customer_id THEN 'sagen tilhører en anden kunde'
           WHEN t.status = 'done' AND t.completed_at IS NULL THEN 'udført uden tidspunkt'
           WHEN t.status <> 'done' AND t.completed_at IS NOT NULL THEN 'tidspunkt men ikke udført'
           WHEN t.assigned_to IS NOT NULL AND NOT coalesce(p.is_active, false) THEN 'tildelt inaktiv/ukendt profil'
      END problem
    FROM public.customer_tasks t LEFT JOIN public.service_cases sc ON sc.id = t.service_case_id LEFT JOIN public.profiles p ON p.id = t.assigned_to
    WHERE t.updated_at >= ${S} OR t.created_at >= ${S}`)) as Row[]
  section('Opgavefejl', tasks.filter((r) => r.problem).map((r) => ({ tildelt: who(r.assigned_to), opgave: short(r.id), sag: r.case_number ?? '—', problem: r.problem })))

  // 8. Ufuldstændige afleveringer (AO afsluttet i perioden)
  const done = (await run(`SELECT w.id, w.assigned_employee_id, sc.case_number, sc.status case_status,
      (SELECT count(*)::int FROM public.time_logs t WHERE t.work_order_id = w.id) logs,
      (SELECT count(*)::int FROM public.time_logs t WHERE t.work_order_id = w.id AND t.end_time IS NULL) running,
      (sc.checklist IS NOT NULL AND jsonb_typeof(sc.checklist) = 'array' AND jsonb_array_length(sc.checklist) > 0) has_checklist,
      (SELECT count(*)::int FROM jsonb_array_elements(CASE WHEN jsonb_typeof(sc.checklist) = 'array' THEN sc.checklist ELSE '[]'::jsonb END) i
        WHERE coalesce((i->>'required')::boolean, false) AND NOT coalesce((i->>'completed')::boolean, false)) req_open,
      (sc.signed_at IS NOT NULL) signed,
      (SELECT count(*)::int FROM public.work_orders w3 WHERE w3.case_id = w.case_id AND w3.status IN ('planned', 'in_progress')) other_open
    FROM public.work_orders w LEFT JOIN public.service_cases sc ON sc.id = w.case_id
    WHERE w.status = 'done' AND w.completed_at >= ${S}`)) as Row[]
  const ho = done.map((r) => {
    const p: string[] = []
    if (!r.logs) p.push('afsluttet uden timer')
    if (r.running) p.push('timer kører stadig')
    if (!r.other_open) {
      if (!r.has_checklist) p.push('ingen aflevering startet')
      else if (r.req_open) p.push(`${r.req_open} påkrævede punkter åbne`)
      if (!r.signed) p.push('ingen kundeunderskrift')
    }
    return { person: empWho(r.assigned_employee_id), ao: short(r.id), sag: r.case_number ?? '—', sagsstatus: r.case_status ?? '—', problem: p.join('; ') }
  })
  section('Ufuldstændige afleveringer (AO afsluttet; aflevering vurderes når sagens sidste AO er lukket)', ho.filter((r) => r.problem))

  // 9. Medarbejder-/satsproblemer (kun dem der kan ramme piloten)
  const empIssues = (await run(`SELECT e.id, e.profile_id, e.active, (e.hourly_rate IS NOT NULL) sale, (e.cost_rate IS NOT NULL) cost, p.is_active prof_active,
      (SELECT count(*)::int FROM public.work_orders w WHERE w.assigned_employee_id = e.id AND w.status IN ('planned', 'in_progress')) open_wo,
      (SELECT count(*)::int FROM public.employees e2 WHERE e2.profile_id = e.profile_id AND e2.active) dup
    FROM public.employees e LEFT JOIN public.profiles p ON p.id = e.profile_id`)) as Row[]
  const ei = empIssues.map((e) => {
    const p: string[] = []
    const relevant = e.active && (Number(e.open_wo) > 0 || (e.profile_id && e.prof_active))
    if (!relevant) return null
    if (!e.sale) p.push('mangler timepris')
    if (!e.cost) p.push('mangler kostpris')
    if (!e.profile_id) p.push('intet login koblet')
    else if (!e.prof_active) p.push('login-profil inaktiv')
    if (Number(e.dup) > 1) p.push('dublet-medarbejderrække')
    return p.length ? { person: empWho(e.id), 'åbne AO': Number(e.open_wo), problem: p.join('; ') } : null
  }).filter(Boolean) as Row[]
  const noEmp = profiles.filter((p) => p.is_active && p.role === 'montør' && !emps.some((e) => e.profile_id === p.id && e.active))
    .map((p) => ({ person: who(p.id), 'åbne AO': 0, problem: 'montør-login uden medarbejderrække' }))
  section('Medarbejder-/satsproblemer (alle, ikke kun perioden)', [...ei, ...noEmp])

  console.log(`\n${problems ? `❌ ${problems} fund — klassificér efter S1/S2/S3 (docs/runbooks/pilot-incident-flow.md); intet er ændret` : '✅ ingen fund'}`)
  return problems
}
