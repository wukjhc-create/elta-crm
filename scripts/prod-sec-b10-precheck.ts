/**
 * PRODUCTION read-only pre-check for SEC-B10 / forslag 00237 (user_role() fail-closed). Kun antal.
 *   npx tsx scripts/prod-sec-b10-precheck.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-sec-b10-precheck', async (run, masked) => {
  console.log(`--- SEC-B10 / 00237 pre-check @ prod:${masked} (kun antal) ---`)
  const q = async (label: string, sql: string) => console.log(`  ${label}: ${(await run(sql))[0]?.n}`)
  await q('auth-brugere i alt', `SELECT count(*)::int n FROM auth.users`)
  await q('auth-brugere UDEN profil (får i dag rollen montør i RLS)', `SELECT count(*)::int n FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)`)
  await q('profiler inaktive (beholder i dag rollen i RLS)', `SELECT count(*)::int n FROM public.profiles WHERE NOT is_active`)
  await q('inaktive profiler uden auth-ban', `SELECT count(*)::int n FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE NOT p.is_active AND (u.banned_until IS NULL OR u.banned_until < now())`)
  await q('profiler med rolle uden for kendte', `SELECT count(*)::int n FROM public.profiles WHERE role::text NOT IN ('admin','serviceleder','montør','salg','bogholderi')`)
  await q('profiler med is_active NULL', `SELECT count(*)::int n FROM public.profiles WHERE is_active IS NULL`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
