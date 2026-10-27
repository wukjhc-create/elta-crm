/**
 * PRODUCTION read-only: datagrundlag for 00240 (læse-scope for customers + service_cases). Hvordan hænger kunder og
 * sager faktisk sammen med medarbejdere (oprettet af, tildelt, arbejdsordrer, opgaver, tilbud)? Kun aggregater —
 * ingen persondata, ingen id'er.
 *   npx tsx scripts/prod-read-scope-shape.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-read-scope-shape', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'profiler_pr_rolle', (SELECT json_object_agg(role, n) FROM (SELECT role::text, count(*)::int n FROM profiles WHERE is_active GROUP BY 1) x),
    'overrides', (SELECT count(*)::int FROM user_permission_overrides),
    'kunder', (SELECT count(*)::int FROM customers),
    'kunder_created_by_rolle', (SELECT json_object_agg(r, n) FROM (SELECT coalesce(p.role::text, 'null/system') r, count(*)::int n FROM customers c LEFT JOIN profiles p ON p.id = c.created_by GROUP BY 1) x),
    'sager', (SELECT count(*)::int FROM service_cases),
    'forslag', (SELECT count(*)::int FROM service_cases WHERE is_proposal),
    'sager_created_by_rolle', (SELECT json_object_agg(r, n) FROM (SELECT coalesce(p.role::text, 'null/system') r, count(*)::int n FROM service_cases s LEFT JOIN profiles p ON p.id = s.created_by GROUP BY 1) x),
    'sager_assigned_to_rolle', (SELECT json_object_agg(r, n) FROM (SELECT coalesce(p.role::text, 'ingen') r, count(*)::int n FROM service_cases s LEFT JOIN profiles p ON p.id = s.assigned_to GROUP BY 1) x),
    'sager_uden_kunde', (SELECT count(*)::int FROM service_cases WHERE customer_id IS NULL),
    'sager_med_anden_partskunde', (SELECT count(*)::int FROM service_cases WHERE (site_customer_id IS NOT NULL AND site_customer_id <> customer_id) OR (payer_customer_id IS NOT NULL AND payer_customer_id <> customer_id) OR (orderer_customer_id IS NOT NULL AND orderer_customer_id <> customer_id) OR (end_customer_id IS NOT NULL AND end_customer_id <> customer_id) OR (purchased_from_customer_id IS NOT NULL AND purchased_from_customer_id <> customer_id)),
    'arbejdsordrer', (SELECT count(*)::int FROM work_orders),
    'ao_status', (SELECT json_object_agg(status, n) FROM (SELECT status, count(*)::int n FROM work_orders GROUP BY 1) x),
    'ao_uden_sag', (SELECT count(*)::int FROM work_orders WHERE case_id IS NULL),
    'ao_uden_sag_med_kunde', (SELECT count(*)::int FROM work_orders WHERE case_id IS NULL AND customer_id IS NOT NULL),
    'ao_kunde_afviger_fra_sag', (SELECT count(*)::int FROM work_orders w JOIN service_cases s ON s.id = w.case_id WHERE w.customer_id IS NOT NULL AND w.customer_id <> s.customer_id),
    'ao_tildelt', (SELECT count(*)::int FROM work_orders WHERE assigned_employee_id IS NOT NULL),
    'ao_tildelt_medarbejder_uden_profil', (SELECT count(*)::int FROM work_orders w JOIN employees e ON e.id = w.assigned_employee_id WHERE e.profile_id IS NULL),
    'medarbejdere_aktive_med_profil', (SELECT count(*)::int FROM employees WHERE active AND profile_id IS NOT NULL),
    'montoer_relaterede_sager', (SELECT json_agg(n ORDER BY n) FROM (
        SELECT count(DISTINCT s.id)::int n FROM profiles p
        LEFT JOIN employees e ON e.profile_id = p.id AND e.active
        LEFT JOIN service_cases s ON s.created_by = p.id OR s.assigned_to = p.id
          OR EXISTS (SELECT 1 FROM work_orders w WHERE w.case_id = s.id AND w.assigned_employee_id = e.id AND w.status <> 'cancelled')
        WHERE p.role = 'montør' AND p.is_active GROUP BY p.id) x),
    'montoer_relaterede_kunder', (SELECT json_agg(n ORDER BY n) FROM (
        SELECT count(DISTINCT c.id)::int n FROM profiles p
        LEFT JOIN employees e ON e.profile_id = p.id AND e.active
        LEFT JOIN customers c ON c.created_by = p.id
          OR EXISTS (SELECT 1 FROM service_cases s WHERE s.customer_id = c.id AND (s.created_by = p.id OR s.assigned_to = p.id
               OR EXISTS (SELECT 1 FROM work_orders w WHERE w.case_id = s.id AND w.assigned_employee_id = e.id AND w.status <> 'cancelled')))
          OR EXISTS (SELECT 1 FROM work_orders w WHERE w.customer_id = c.id AND w.assigned_employee_id = e.id AND w.status <> 'cancelled')
        WHERE p.role = 'montør' AND p.is_active GROUP BY p.id) x),
    'opgaver_tildelt_montoer', (SELECT count(*)::int FROM customer_tasks t JOIN profiles p ON p.id = t.assigned_to WHERE p.role = 'montør'),
    'opgaver_tildelt_montoer_uden_relation', (SELECT count(*)::int FROM customer_tasks t JOIN profiles p ON p.id = t.assigned_to
        LEFT JOIN employees e ON e.profile_id = p.id AND e.active
        WHERE p.role = 'montør' AND t.customer_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM service_cases s WHERE s.customer_id = t.customer_id AND (s.created_by = p.id OR s.assigned_to = p.id
            OR EXISTS (SELECT 1 FROM work_orders w WHERE w.case_id = s.id AND w.assigned_employee_id = e.id AND w.status <> 'cancelled')))
          AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.customer_id = t.customer_id AND w.assigned_employee_id = e.id AND w.status <> 'cancelled')),
    'tilbud_created_by_rolle', (SELECT json_object_agg(r, n) FROM (SELECT coalesce(p.role::text, 'null/system') r, count(*)::int n FROM offers o LEFT JOIN profiles p ON p.id = o.created_by GROUP BY 1) x),
    'tagtegninger', (SELECT count(*)::int FROM roof_drawings),
    'tagtegninger_uden_sag', (SELECT count(*)::int FROM roof_drawings WHERE service_case_id IS NULL)
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
