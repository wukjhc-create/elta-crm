/**
 * PRODUCTION read-only: antal aktive brugere pr. rolle (ingen navne/e-mails). Bruges til at vurdere den reelle
 * eksponering af aabne skrive-policies (kun indloggede kan udnytte dem).
 *   npx tsx scripts/prod-profile-roles.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-profile-roles', async (run, masked) => {
  console.log(`--- brugere pr. rolle @ prod:${masked} ---`)
  console.log(JSON.stringify(await run(`SELECT coalesce(role::text,'?') rolle, coalesce(is_active, true) aktiv, count(*)::int n FROM profiles GROUP BY 1,2 ORDER BY 1,2`)))
  console.log('  auth.users (login-konti):', JSON.stringify((await run(`SELECT count(*)::int n, count(*) FILTER (WHERE last_sign_in_at > now() - interval '30 days')::int aktive_30d FROM auth.users`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
