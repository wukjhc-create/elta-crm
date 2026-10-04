/**
 * Pilot-overvaagning (READ-ONLY). Faste, parameterloese SELECTs — bruges identisk mod production
 * (prod:pilot-health, read-only session) og staging (harness:pilot-health).
 *
 * Svarer paa: virker systemet (fejl pr. service), bruges det (aktive brugere pr. rolle, oprettede sager/tilbud,
 * audit-aktivitet), og er sikkerhedsgraenserne intakte (agents disabled/suggest, ingen fejlede/uvisse agent-actions).
 */

export type Runner = (sql: string) => Promise<any[]>

export const PILOT_METRIC_QUERIES = {
  healthErrors24h: `SELECT service, count(*) FILTER (WHERE status = 'error') AS errors, count(*) FILTER (WHERE status = 'warning') AS warnings,
      max(created_at) FILTER (WHERE status = 'error') AS last_error
    FROM public.system_health_log WHERE created_at > now() - interval '24 hours' GROUP BY service ORDER BY errors DESC, service`,
  activeUsers: `SELECT coalesce(p.role, '(ingen profil)') AS role, count(*) AS users,
      count(*) FILTER (WHERE u.last_sign_in_at > now() - interval '24 hours') AS active_24h,
      count(*) FILTER (WHERE u.last_sign_in_at > now() - interval '7 days') AS active_7d
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
    WHERE coalesce(u.email, '') NOT LIKE '%@harness.test' GROUP BY 1 ORDER BY 1`,
  agentSafety: `SELECT count(*) AS configs, count(*) FILTER (WHERE enabled) AS enabled,
      count(*) FILTER (WHERE safety_mode <> 'suggest') AS not_suggest FROM public.agent_configs`,
  agentActions24h: `SELECT count(*) AS actions, count(*) FILTER (WHERE status = 'executed') AS executed,
      count(*) FILTER (WHERE status = 'failed') AS failed, count(*) FILTER (WHERE status = 'needs_verification') AS needs_verification
    FROM public.agent_actions WHERE created_at > now() - interval '24 hours'`,
  activity24h: `SELECT
      (SELECT count(*) FROM public.service_cases WHERE created_at > now() - interval '24 hours') AS cases_created,
      (SELECT count(*) FROM public.offers WHERE created_at > now() - interval '24 hours') AS offers_created,
      (SELECT count(*) FROM public.audit_logs WHERE created_at > now() - interval '24 hours') AS audit_events,
      (SELECT count(*) FROM public.customer_tasks WHERE created_at > now() - interval '24 hours') AS tasks_created`,
  // N2/00185: timer der afventer godkendelse (montør registrerer → serviceleder/admin godkender)
  timeApproval: `SELECT count(*) FILTER (WHERE approval_status = 'pending' AND end_time IS NOT NULL) AS pending,
      coalesce(floor(extract(epoch FROM now() - min(end_time) FILTER (WHERE approval_status = 'pending' AND end_time IS NOT NULL)) / 86400), 0) AS oldest_pending_days,
      count(*) FILTER (WHERE approval_status = 'approved' AND approved_at > now() - interval '7 days' AND approved_by IS NOT NULL) AS approved_7d,
      count(*) FILTER (WHERE approval_status = 'rejected' AND approved_at > now() - interval '7 days') AS rejected_7d
    FROM public.time_logs`,
} as const
for (const [k, sql] of Object.entries(PILOT_METRIC_QUERIES)) {
  if (!/^SELECT\s/i.test(sql) || sql.includes(';')) throw new Error(`pilot-metrics: '${k}' er ikke en ren SELECT`)
}

export interface PilotHealth {
  target: string
  at: string
  health: Array<{ service: string; errors: number; warnings: number; last_error: string | null }>
  users: Array<{ role: string; users: number; active_24h: number; active_7d: number }>
  agents: { configs: number; enabled: number; not_suggest: number }
  agentActions24h: { actions: number; executed: number; failed: number; needs_verification: number }
  activity24h: { cases_created: number; offers_created: number; audit_events: number; tasks_created: number }
  timeApproval: { pending: number; oldest_pending_days: number; approved_7d: number; rejected_7d: number }
  alarms: string[]
}

const num = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v]))

export async function collectPilotHealth(target: string, run: Runner): Promise<PilotHealth> {
  const health = (await run(PILOT_METRIC_QUERIES.healthErrors24h)).map(num) as PilotHealth['health']
  const users = (await run(PILOT_METRIC_QUERIES.activeUsers)).map(num) as PilotHealth['users']
  const agents = num((await run(PILOT_METRIC_QUERIES.agentSafety))[0]) as PilotHealth['agents']
  const agentActions24h = num((await run(PILOT_METRIC_QUERIES.agentActions24h))[0]) as PilotHealth['agentActions24h']
  const activity24h = num((await run(PILOT_METRIC_QUERIES.activity24h))[0]) as PilotHealth['activity24h']
  const timeApproval = num((await run(PILOT_METRIC_QUERIES.timeApproval))[0]) as PilotHealth['timeApproval']
  const alarms: string[] = []
  // Alarmgraenser for pilotperioden (se docs/pilot/PILOT_OPERATIONS.md §Overvaagning)
  for (const h of health) if (Number(h.errors) >= 5) alarms.push(`${h.service}: ${h.errors} fejl/24t`)
  if (Number(agents.enabled) > 0) alarms.push(`${agents.enabled} agent(er) ENABLED`)
  if (Number(agents.not_suggest) > 0) alarms.push(`${agents.not_suggest} agent(er) ikke i suggest-mode`)
  if (Number(agentActions24h.needs_verification) > 0) alarms.push(`${agentActions24h.needs_verification} agent-action(s) needs_verification`)
  if (Number(agentActions24h.failed) > 0) alarms.push(`${agentActions24h.failed} fejlede agent-action(s)/24t`)
  if (Number(timeApproval.oldest_pending_days) > 7) alarms.push(`timer har ventet på godkendelse i ${timeApproval.oldest_pending_days} dage`)
  return { target, at: new Date().toISOString(), health, users, agents, agentActions24h, activity24h, timeApproval, alarms }
}

export function formatPilotHealth(h: PilotHealth): string {
  const l = [`=== PILOT HEALTH @ ${h.target} (${h.at}) ===`, 'Fejl/advarsler pr. service (24t):']
  if (!h.health.length) l.push('  (ingen health-log de sidste 24t)')
  for (const s of h.health) l.push(`  ${s.service.padEnd(16)} fejl=${s.errors} advarsler=${s.warnings}${s.last_error ? ` seneste fejl=${s.last_error}` : ''}`)
  l.push('Brugere pr. rolle (ekskl. harness):')
  for (const u of h.users) l.push(`  ${String(u.role).padEnd(16)} brugere=${u.users} aktive 24t=${u.active_24h} 7d=${u.active_7d}`)
  l.push(`Agents: ${h.agents.configs} configs, enabled=${h.agents.enabled}, ikke-suggest=${h.agents.not_suggest}`)
  l.push(`Agent-actions 24t: ${h.agentActions24h.actions} (udført ${h.agentActions24h.executed}, fejlet ${h.agentActions24h.failed}, needs_verification ${h.agentActions24h.needs_verification})`)
  l.push(`Aktivitet 24t: sager=${h.activity24h.cases_created} tilbud=${h.activity24h.offers_created} opgaver=${h.activity24h.tasks_created} audit=${h.activity24h.audit_events}`)
  l.push(`Timegodkendelse: afventer=${h.timeApproval.pending} (ældste ${h.timeApproval.oldest_pending_days} d) · godkendt 7d=${h.timeApproval.approved_7d} · afvist 7d=${h.timeApproval.rejected_7d}`)
  l.push(h.alarms.length ? `🔴 ALARM: ${h.alarms.join('; ')}` : '🟢 ingen alarmer')
  return l.join('\n')
}
