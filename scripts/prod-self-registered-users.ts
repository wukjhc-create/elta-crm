/**
 * PRODUCTION read-only: auth-review 2026-10-07 (P1) — er der konti oprettet via ÅBEN selvregistrering (ikke inviteret)?
 * Kun antal pr. kategori — ingen e-mails/navne ud.
 *   npx tsx scripts/prod-self-registered-users.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-self-registered-users', async (run, masked) => {
  const rows = await run(`SELECT
      count(*)::int auth_users,
      count(*) FILTER (WHERE u.invited_at IS NULL)::int not_invited,
      count(*) FILTER (WHERE u.invited_at IS NULL AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = u.id))::int not_invited_no_employee,
      count(*) FILTER (WHERE u.invited_at IS NULL AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = u.id)
        AND p.is_active)::int not_invited_no_employee_active,
      count(*) FILTER (WHERE u.invited_at IS NULL AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = u.id)
        AND u.last_sign_in_at IS NOT NULL)::int not_invited_no_employee_signed_in,
      max(u.created_at) FILTER (WHERE u.invited_at IS NULL AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = u.id))::date newest_unknown
    FROM auth.users u LEFT JOIN profiles p ON p.id = u.id`)
  console.log(`--- selvregistrerede konti @ prod:${masked} ---`)
  console.table(rows)
  const roles = await run(`SELECT p.role, count(*)::int n FROM auth.users u JOIN profiles p ON p.id = u.id
    WHERE u.invited_at IS NULL AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = u.id) GROUP BY 1 ORDER BY 1`)
  console.log('roller blandt ikke-inviterede uden medarbejderkobling:')
  console.table(roles)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
