/**
 * Phase C0 — baseline for tidsbesparelse (read-only). Én SELECT, kun antal/medianer — aldrig indhold eller personer.
 * Formål: tal FØR C1–C7, så effekten kan måles bagefter med samme forespørgsel (samme periode-længde).
 *
 * Målepunkter (Henrik 2026-11-26): behandlede henvendelser, andel ukendte/uidentificerede, manuelle koblinger og tid til
 * kobling/behandling, automatisk oprettede kunder, Stage A-forslag (afgjort/uafgjort). "Andel korrekt klassificerede"
 * kræver et menneskeligt facit — shadow-rapporten (C1) giver enighed med eksisterende arbejdsgange indtil da.
 */

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
