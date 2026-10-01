/** PRODUCTION read-only: er montør-logins koblet til en aktiv medarbejder (employees.profile_id)? Kun antal. GO-LIVE G4. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-montor-linkage', async (run) => {
  console.log(JSON.stringify((await run(`SELECT
    (SELECT count(*)::int FROM profiles p WHERE p.role = 'montør' AND p.is_active) montoer_logins,
    (SELECT count(*)::int FROM profiles p WHERE p.role = 'montør' AND p.is_active AND EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = p.id AND e.active)) koblet_til_aktiv_medarbejder,
    (SELECT count(*)::int FROM employees e WHERE e.active) aktive_medarbejdere,
    (SELECT count(*)::int FROM employees e WHERE e.active AND e.profile_id IS NULL) medarbejdere_uden_login,
    (SELECT count(*)::int FROM work_orders w WHERE w.status IN ('planned','in_progress')) aabne_arbejdsordrer,
    (SELECT count(*)::int FROM work_orders w WHERE w.status IN ('planned','in_progress') AND w.assigned_employee_id IS NULL) aabne_uden_medarbejder`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
