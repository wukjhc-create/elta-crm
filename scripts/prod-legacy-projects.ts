/**
 * PRODUCTION read-only: brug af den gamle projektmodel (projects/project_tasks/time_entries) mod sager/time_logs.
 * Grundlag for legacy-oprydning (D39 → NEXT-2). Kun antal.
 *   npx tsx scripts/prod-legacy-projects.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-legacy-projects', async (run) => {
  const r = (await run(`SELECT json_build_object(
    'projects', (SELECT count(*) FROM projects),
    'projects_seneste', (SELECT max(created_at) FROM projects),
    'project_tasks', (SELECT count(*) FROM project_tasks),
    'time_entries', (SELECT count(*) FROM time_entries),
    'messages_med_projekt', (SELECT count(*) FROM messages WHERE project_id IS NOT NULL),
    'service_cases', (SELECT count(*) FROM service_cases),
    'time_logs', (SELECT count(*) FROM time_logs)
  ) j`))[0].j
  console.log(JSON.stringify(r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
