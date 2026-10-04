/**
 * PRODUCTION read-only: har admin-profiler en e-mail (admin-alarmernes fallback-modtagere)? Kun antal.
 *   npx tsx scripts/prod-admin-emails.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-admin-emails', async (run) => {
  const r = (await run(`SELECT json_build_object(
    'admins', (SELECT count(*)::int FROM profiles WHERE role = 'admin'),
    'admins_med_email', (SELECT count(*)::int FROM profiles WHERE role = 'admin' AND email LIKE '%@%'),
    'admins_auth_email', (SELECT count(*)::int FROM profiles p JOIN auth.users u ON u.id = p.id WHERE p.role = 'admin' AND u.email LIKE '%@%')
  ) r`))[0].r
  console.log(JSON.stringify(r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
