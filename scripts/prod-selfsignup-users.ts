/** PRODUCTION read-only (P1): brugere der ser selvregistrerede ud (ikke inviteret, ikke koblet til medarbejder). Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-selfsignup-users', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'auth_brugere', (SELECT count(*)::int FROM auth.users),
    'ikke_inviteret', (SELECT count(*)::int FROM auth.users WHERE invited_at IS NULL),
    'ikke_inviteret_og_ikke_medarbejder', (SELECT count(*)::int FROM auth.users u WHERE u.invited_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = u.id)),
    'heraf_aktive_profiler', (SELECT count(*)::int FROM auth.users u JOIN profiles p ON p.id = u.id WHERE u.invited_at IS NULL
      AND p.is_active AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = u.id)),
    'nyeste_oprettet', (SELECT max(created_at)::date::text FROM auth.users)
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
