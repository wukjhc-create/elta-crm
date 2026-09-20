/**
 * Test Harness — invariant-katalog. Hver check har SQL der returnerer
 * VIOLERENDE raekker (forvent 0). READ-ONLY. Koeres af runner (helst mod
 * staging, men er ikke-muterende og kan bruges til health-checks generelt).
 *
 * Dette er fundamentet — checks kan udvides loebende.
 */
import type { InvariantCheck } from './types'

export const INVARIANTS: InvariantCheck[] = [
  {
    id: 'duplicate_customers_email',
    title: 'Info: kunder der deler email',
    description:
      'Samme email paa flere customers. BEMAERK: ofte legitimt (delte B2B/partner-' +
      'postkasser). Kun informationelt — se duplicate_customers_email_name for aegte dubletter.',
    severity: 'low',
    violationSql: `SELECT lower(email) AS email, count(*) AS n
      FROM customers WHERE email IS NOT NULL AND email <> ''
      GROUP BY lower(email) HAVING count(*) > 1`,
    sampleColumns: ['email', 'n'],
  },
  {
    id: 'duplicate_customers_email_name',
    title: 'Dubletter: samme email OG samme navn',
    description: 'Samme email + samme normaliserede company_name = sandsynlig aegte dublet.',
    severity: 'high',
    violationSql: `SELECT lower(email) AS email, lower(trim(company_name)) AS name, count(*) AS n
      FROM customers WHERE email IS NOT NULL AND email <> '' AND company_name IS NOT NULL
      GROUP BY lower(email), lower(trim(company_name)) HAVING count(*) > 1`,
    sampleColumns: ['email', 'name', 'n'],
  },
  {
    id: 'duplicate_offer_number',
    title: 'Dubletter: tilbud med samme offer_number',
    description: 'offer_number skal vaere unikt.',
    severity: 'critical',
    violationSql: `SELECT offer_number, count(*) AS n
      FROM offers WHERE offer_number IS NOT NULL
      GROUP BY offer_number HAVING count(*) > 1`,
    sampleColumns: ['offer_number', 'n'],
  },
  {
    id: 'orphan_offer_line_items',
    title: 'Orphan: offer_line_items uden offer',
    description: 'Linjer der peger paa et ikke-eksisterende tilbud.',
    severity: 'high',
    violationSql: `SELECT li.id FROM offer_line_items li
      LEFT JOIN offers o ON o.id = li.offer_id WHERE o.id IS NULL`,
    sampleColumns: ['id'],
  },
  {
    id: 'agent_action_run_task_consistency',
    title: 'Agent: action.run_id matcher task.run_id',
    description: 'Composite FK skal forhindre mismatch — 0 forventet.',
    severity: 'critical',
    violationSql: `SELECT a.id FROM agent_actions a
      JOIN agent_tasks t ON t.id = a.task_id WHERE t.run_id <> a.run_id`,
    sampleColumns: ['id'],
  },
  {
    id: 'agent_double_execution',
    title: 'Agent: samme action eksekveret >1 gang',
    description: 'Mere end én "executed"-audit pr. action = dobbelt-eksekvering.',
    severity: 'critical',
    violationSql: `SELECT entity_id, count(*) AS n FROM audit_logs
      WHERE entity_type='agent_action' AND action='executed'
      GROUP BY entity_id HAVING count(*) > 1`,
    sampleColumns: ['entity_id', 'n'],
  },
  {
    id: 'executed_missing_audit',
    title: 'Agent: executed action uden audit',
    description: 'Enhver eksekveret action skal have et audit-spor.',
    severity: 'high',
    violationSql: `SELECT a.id FROM agent_actions a
      WHERE a.status='executed'
      AND NOT EXISTS (SELECT 1 FROM audit_logs l
        WHERE l.entity_type='agent_action' AND l.entity_id=a.id AND l.action='executed')`,
    sampleColumns: ['id'],
  },
  {
    id: 'hardblocked_executed_without_approval',
    title: 'Sikkerhed: hard-blocked action executed uden approval',
    description: 'send/push/finance/delete skal have en godkendt approval.',
    severity: 'critical',
    violationSql: `SELECT a.id, a.side_effect_class FROM agent_actions a
      WHERE a.side_effect_class IN ('send_external','push_external','finance','delete')
      AND a.status IN ('executed','executing')
      AND NOT EXISTS (SELECT 1 FROM agent_action_approvals ap
        WHERE ap.action_id=a.id AND ap.decision='approved')`,
    sampleColumns: ['id', 'side_effect_class'],
  },
  {
    id: 'stale_approval_still_pending',
    title: 'Stale: udloebet approval paa ikke-afsluttet action',
    description: 'Approval hvis expires_at er passeret men action stadig afventer.',
    severity: 'medium',
    violationSql: `SELECT ap.id FROM agent_action_approvals ap
      JOIN agent_actions a ON a.id = ap.action_id
      WHERE ap.decision='approved' AND ap.expires_at IS NOT NULL AND ap.expires_at < now()
      AND a.status IN ('planned','awaiting_approval','approved')`,
    sampleColumns: ['id'],
  },
  {
    id: 'duplicate_agent_action_idempotency',
    title: 'Agent: dublet idempotency_key',
    description: 'idempotency_key skal vaere unik (UNIQUE-constraint bakker op).',
    severity: 'critical',
    violationSql: `SELECT idempotency_key, count(*) AS n FROM agent_actions
      GROUP BY idempotency_key HAVING count(*) > 1`,
    sampleColumns: ['idempotency_key', 'n'],
  },
  {
    id: 'agent_tables_rls_enabled',
    title: 'Sikkerhed: RLS enabled paa agent-tabeller',
    description: 'Alle 5 agent-tabeller skal have RLS aktiveret.',
    severity: 'critical',
    violationSql: `SELECT relname FROM pg_class
      WHERE relname IN ('agent_runs','agent_tasks','agent_actions','agent_action_approvals','agent_configs')
      AND relrowsecurity = false`,
    sampleColumns: ['relname'],
  },
  {
    id: 'anon_grants_on_agent_tables',
    title: 'Sikkerhed: anon-grants paa agent-tabeller',
    description: 'anon maa ikke have privilegier paa agent-tabeller.',
    severity: 'critical',
    violationSql: `SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee='anon' AND table_schema='public'
      AND table_name IN ('agent_runs','agent_tasks','agent_actions','agent_action_approvals','agent_configs')`,
    sampleColumns: ['table_name', 'privilege_type'],
  },
  {
    id: 'agents_enabled_unexpectedly',
    title: 'Sikkerhed: agenter enabled (forventet 0 under udvikling)',
    description: 'Ingen agent boer vaere enabled i denne fase.',
    severity: 'high',
    violationSql: `SELECT agent_type FROM agent_configs WHERE enabled = true`,
    sampleColumns: ['agent_type'],
  },
]
