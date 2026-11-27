/**
 * Phase C0 — baseline for tidsbesparelse (read-only). Én SELECT, kun antal/medianer — aldrig indhold eller personer.
 * Formål: tal FØR C1–C7, så effekten kan måles bagefter med samme forespørgsel (samme periode-længde).
 *
 * Målepunkter (Henrik 2026-11-26): behandlede henvendelser, andel ukendte/uidentificerede, manuelle koblinger og tid til
 * kobling/behandling, automatisk oprettede kunder, Stage A-forslag (afgjort/uafgjort). "Andel korrekt klassificerede"
 * kræver et menneskeligt facit — shadow-rapporten (C1) giver enighed med eksisterende arbejdsgange indtil da.
 */

/** Seneste C1a-vurdering pr. (mail, bruger) — tidligere vurderinger er erstattet af rettelsen og tælles ikke i andele. */
function latestFeedback(s: string): string {
  return `(SELECT DISTINCT ON (entity_id, user_id) entity_id, user_id, metadata FROM public.audit_logs
      WHERE action = 'classification_feedback' AND created_at >= ${s} ORDER BY entity_id, user_id, created_at DESC)`
}

export function baselineSql(sinceIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceIso)) throw new Error('since skal være YYYY-MM-DD')
  const s = `'${sinceIso}'::timestamptz`
  return `SELECT json_build_object(
  'since', ${s},
  'days', round(extract(epoch FROM now() - ${s}) / 86400),
  'mails', (SELECT json_build_object(
      'total', count(*),
      'kontakt', count(*) FILTER (WHERE lower(coalesce(to_email, '')) LIKE '%kontakt@%'),
      'ordre', count(*) FILTER (WHERE lower(coalesce(to_email, '')) LIKE '%ordre@%'),
      'linked_customer', count(customer_id),
      'linked_case', count(service_case_id),
      'unidentified', count(*) FILTER (WHERE link_status::text = 'unidentified'),
      'pending', count(*) FILTER (WHERE link_status::text = 'pending'),
      'ignored', count(*) FILTER (WHERE link_status::text = 'ignored'),
      'linked_manual', count(*) FILTER (WHERE linked_by = 'manual'),
      'linked_auto', count(*) FILTER (WHERE linked_by LIKE 'auto%' AND customer_id IS NOT NULL),
      'median_h_to_link_manual', percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM linked_at - received_at) / 3600) FILTER (WHERE linked_by = 'manual' AND linked_at IS NOT NULL),
      'median_h_to_link_all', percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM linked_at - received_at) / 3600) FILTER (WHERE linked_at IS NOT NULL AND customer_id IS NOT NULL))
    FROM public.incoming_emails WHERE received_at >= ${s}),
  'customers', (SELECT json_build_object(
      'created', count(*),
      'auto_email', count(*) FILTER (WHERE 'auto-email' = ANY(tags)),
      'placeholder_email', count(*) FILTER (WHERE lower(coalesce(email, '')) LIKE '%@elta-crm.local'))
    FROM public.customers WHERE created_at >= ${s}),
  'customers_total', (SELECT json_build_object('total', count(*), 'auto_email', count(*) FILTER (WHERE 'auto-email' = ANY(tags))) FROM public.customers),
  'henvendelser', (SELECT json_build_object(
      'created', count(*),
      'handled', count(handled_at),
      'assigned', count(assigned_profile_id),
      'customer_known', count(customer_id),
      'case_linked', count(service_case_id),
      'median_h_to_handled', percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM handled_at - first_at) / 3600) FILTER (WHERE handled_at IS NOT NULL),
      'by_channel', (SELECT coalesce(json_object_agg(channel, n), '{}'::json) FROM (SELECT channel, count(*) n FROM public.conversations WHERE created_at >= ${s} GROUP BY channel) x))
    FROM public.conversations WHERE created_at >= ${s}),
  'delay_insert_med_min', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM created_at - received_at) / 60) FROM public.incoming_emails WHERE received_at >= ${s}),
  'dup_email_groups', (SELECT json_build_object('groups', count(*), 'customers', coalesce(sum(n), 0)) FROM (
      SELECT lower(trim(email)) e, count(*) n FROM public.customers
      WHERE coalesce(trim(email), '') <> '' AND lower(email) NOT LIKE '%@elta-crm.local' GROUP BY 1 HAVING count(*) > 1) d),
  'case_proposals', (SELECT count(*) FROM public.conversation_actions WHERE action_type = 'create_case_proposal' AND created_at >= ${s}),
  'feedback', (SELECT coalesce(json_object_agg(v, n), '{}'::json) FROM (
      SELECT coalesce(metadata->>'verdict', '?') v, count(*) n FROM ${latestFeedback(s)} lf GROUP BY 1) f),
  'feedback_detail', json_build_object(
      'rows', (SELECT count(*) FROM public.audit_logs WHERE action = 'classification_feedback' AND created_at >= ${s}),
      'corrections', (SELECT count(*) FROM public.audit_logs WHERE action = 'classification_feedback' AND created_at >= ${s} AND metadata->>'supersedes' IS NOT NULL),
      'mails', (SELECT count(DISTINCT entity_id) FROM ${latestFeedback(s)} lf),
      'by_version', (SELECT coalesce(json_object_agg(v, n), '{}'::json) FROM (SELECT coalesce(metadata->>'version', '?') v, count(*) n FROM ${latestFeedback(s)} lf GROUP BY 1) x),
      'dim_corrected', (SELECT coalesce(json_object_agg(k, n), '{}'::json) FROM (
          SELECT k, count(*) n FROM ${latestFeedback(s)} lf, jsonb_object_keys(coalesce(lf.metadata->'corrected', '{}'::jsonb)) k
          WHERE lf.metadata->>'verdict' IN ('partial', 'wrong') GROUP BY 1) x)),
  'forslag', (SELECT json_build_object(
      'total', count(*),
      'decided', count(decided_at),
      'by_state', (SELECT coalesce(json_object_agg(state, n), '{}'::json) FROM (SELECT state, count(*) n FROM public.conversation_actions WHERE created_at >= ${s} GROUP BY state) x),
      'median_h_to_decision', percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM decided_at - created_at) / 3600) FILTER (WHERE decided_at IS NOT NULL))
    FROM public.conversation_actions WHERE created_at >= ${s})
) j`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

const pct = (n: number, d: number) => (d ? `${Math.round((1000 * n) / d) / 10} %` : '—')
const h = (x: number | null | undefined) => (x == null ? '—' : x < 48 ? `${Math.round(x * 10) / 10} t` : `${Math.round((x / 24) * 10) / 10} d`)

export function baselineReport(j: J): string[] {
  const m = j.mails, c = j.customers, hv = j.henvendelser, f = j.forslag
  const days = Math.max(1, Number(j.days))
  return [
    `PERIODE: fra ${String(j.since).slice(0, 10)} (${days} dage)`,
    `MAILS: ${m.total} (≈ ${Math.round((m.total / days) * 7)}/uge) · kontakt@ ${m.kontakt} · ordre@ ${m.ordre}`,
    `  koblet til kunde ${m.linked_customer} (${pct(m.linked_customer, m.total)}; automatisk ${m.linked_auto}, manuelt ${m.linked_manual}) · koblet til sag ${m.linked_case} (${pct(m.linked_case, m.total)})`,
    `  uidentificeret ${m.unidentified} (${pct(m.unidentified, m.total)}) · afventer ${m.pending} · ignoreret ${m.ignored}`,
    `  median tid til kobling: manuel ${h(m.median_h_to_link_manual)} · alle ${h(m.median_h_to_link_all)}`,
    `KUNDER oprettet i perioden: ${c.created} · heraf auto-oprettet fra mail ${c.auto_email} (${pct(c.auto_email, c.created)}) · uden rigtig e-mail ${c.placeholder_email}`,
    `  kunderegister i alt: ${j.customers_total.total} · auto-oprettet ${j.customers_total.auto_email} (${pct(j.customers_total.auto_email, j.customers_total.total)})`,
    `HENVENDELSER (Stage A): oprettet ${hv.created} ${JSON.stringify(hv.by_channel)} · behandlet ${hv.handled} (${pct(hv.handled, hv.created)}) · median tid til behandlet ${h(hv.median_h_to_handled)}`,
    `  tildelt ${hv.assigned} · kendt kunde ${hv.customer_known} (${pct(hv.customer_known, hv.created)}) · koblet til sag ${hv.case_linked}`,
    `FORSLAG (Stage A-handlinger): ${f.total} · afgjort ${f.decided} (${pct(f.decided, f.total)}) · ${JSON.stringify(f.by_state)} · median tid til afgørelse ${h(f.median_h_to_decision)}`,
  ]
}

/**
 * Henriks komplette målepunktsliste (2026-11-26). Hvert punkt er enten MÅLT (med kilde) eller IKKE MÅLBAR (med hvad der
 * mangler). Der opfindes aldrig tal; estimeret tidsbesparelse vises kun med eksplicitte antagelser og aldrig som målt.
 * `shadow` = optællinger fra C1-shadow-rapporten over samme periode (afsender-/henvendelsestyper).
 */
export interface ShadowCounts { total: number; sender: Record<string, number>; inquiry: Record<string, number>; action: Record<string, number>; multiCustomerEmail: number }

export function metricsReport(j: J, sh: ShadowCounts): string[] {
  const m = j.mails, hv = j.henvendelser, f = j.forslag
  const st = (f.by_state ?? {}) as Record<string, number>
  const fb = (j.feedback ?? {}) as Record<string, number>
  const fd = (j.feedback_detail ?? {}) as { rows?: number; corrections?: number; mails?: number; by_version?: Record<string, number>; dim_corrected?: Record<string, number> }
  const fbTotal = Object.values(fb).reduce((a, b) => a + Number(b), 0)
  const assessed = Number(fb.correct ?? 0) + Number(fb.partial ?? 0) + Number(fb.wrong ?? 0)
  const NM = (why: string) => `IKKE MÅLBAR — ${why}`
  const rows: Array<[string, string]> = [
    ['Antal modtagne henvendelser', `${m.total} mails (kontakt@ ${m.kontakt}, ordre@ ${m.ordre}) · ${hv.created} henvendelser i Stage A`],
    ['Antal behandlede henvendelser', `${hv.handled} markeret behandlet i Henvendelser (mails i mail-indbakken lukker ikke henvendelsen — se Stage A-undersøgelsen)`],
    ['Andel korrekt klassificerede', assessed ? `${pct(Number(fb.correct ?? 0), assessed)} (n=${assessed} vurderet i C1a-feedback)` : NM('kræver C1a-feedback (0 vurderinger)')],
    ['Andel forkert klassificerede', assessed ? `forkert ${pct(Number(fb.wrong ?? 0), assessed)} · delvist ${pct(Number(fb.partial ?? 0), assessed)} · rettet pr. dimension ${JSON.stringify(fd.dim_corrected ?? {})} · versioner ${JSON.stringify(fd.by_version ?? {})} · ${Number(fd.corrections ?? 0)} rettelser af tidligere feedback (kun seneste vurdering pr. mail og bruger tæller)` : NM('kræver C1a-feedback (0 vurderinger)')],
    ['Andel ukendte henvendelser', `${pct(sh.inquiry.unknown ?? 0, sh.total)} ukendt henvendelsestype · ${pct(sh.sender.unknown ?? 0, sh.total)} ukendt afsender (C1-shadow, ${sh.total} mails)`],
    ['Genkendte eksisterende kunder', `${sh.sender.existing_customer ?? 0} mails (deterministisk, C1-shadow)`],
    ['Genkendte leverandører', `${sh.sender.supplier ?? 0} mails (C1-shadow)`],
    ['Genkendte samarbejdspartnere', `${sh.sender.cooperation_partner ?? 0} mails (C1-shadow; kun 1 part med relation i prod)`],
    ['Potentielle dubletkunder', `${j.dup_email_groups.groups} e-mailadresser deles af ${j.dup_email_groups.customers} kunder (hele registret) · ${sh.multiCustomerEmail} mails i perioden matcher flere kunder`],
    ['Faktisk undgåede dubletoprettelser', NM('ingen dublet-forebyggelse i drift endnu (C4); tælles først når den findes')],
    ['Mails koblet til eksisterende sager', `${m.linked_case}`],
    ['Forslag til nye sager', `${j.case_proposals} Stage A-sagsforslag · ${sh.action.create_service_case_proposal ?? 0} servicesag-forslag i C1-shadow (ikke vist for nogen)`],
    ['Manuelle handlinger pr. henvendelse', NM('handlinger logges ikke pr. henvendelse (kun manuelle koblinger: ' + m.linked_manual + ')')],
    ['Aktivt tidsforbrug pr. henvendelse', NM('kræver tidsmåling i brugerfladen (ingen data)')],
    ['Tid fra modtagelse til behandling', `${hv.handled ? h(hv.median_h_to_handled) : NM('0 behandlede henvendelser')} · mail ind i CRM median ${j.delay_insert_med_min == null ? '—' : `${Math.round(j.delay_insert_med_min)} min`} · til kundekobling median ${h(m.median_h_to_link_all)}`],
    ['Accepterede og afviste forslag', `accepteret/udført ${Number(st.approved ?? 0) + Number(st.executed ?? 0)} · afvist ${Number(st.rejected ?? 0)}`],
    ['Uafgjorte forslag', `${Number(st.proposed ?? 0)} afventer · ${Number(st.blocked ?? 0)} blokeret (kan ikke afgøres i UI)`],
    ['Faktisk målt tidsbesparelse', NM('kræver aktivt tidsforbrug før/efter (ingen måling endnu)')],
    ['Estimeret tidsbesparelse', NM('ikke beregnet — kræver godkendte antagelser (min. pr. manuel handling); vises altid adskilt fra målt')],
  ]
  return [`MÅLEPUNKTER fra ${String(j.since).slice(0, 10)} (${j.days} dage) · C1a-feedback: ${fbTotal} gældende vurderinger på ${Number(fd.mails ?? 0)} mails (${Number(fd.rows ?? 0)} rækker inkl. rettelser)`, ...rows.map(([k, v]) => `  ${k.padEnd(38)} ${v}`)]
}
