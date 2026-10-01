/** PRODUCTION read-only: audit_logs pr. handling seneste 60 dage (kun antal) — tjek om bruger-session-audits lander. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-audit-log-stats', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'i_alt', (SELECT count(*)::int FROM audit_logs),
    'seneste_60d_pr_entity', (SELECT json_object_agg(entity_type, n) FROM (SELECT entity_type, count(*)::int n FROM audit_logs WHERE created_at > now() - interval '60 days' GROUP BY 1) x),
    'invoice_actions', (SELECT json_object_agg(action, n) FROM (SELECT action, count(*)::int n FROM audit_logs WHERE entity_type = 'invoice' GROUP BY 1) y),
    'med_user_id', (SELECT count(*)::int FROM audit_logs WHERE user_id IS NOT NULL),
    'seneste', (SELECT max(created_at)::text FROM audit_logs)
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
