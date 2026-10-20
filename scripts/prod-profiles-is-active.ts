/**
 * PRODUCTION read-only (migrationspakke, Henrik 2026-10-20 "IS_ACTIVE NULL"): hvor mange profiler har is_active NULL,
 * hvilke roller, har de en auth-bruger, og hvornår blev de oprettet/sidst logget ind. KUN antal/roller/datoer — ingen
 * navne, mails eller id'er ud.
 *   npx tsx scripts/prod-profiles-is-active.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-profiles-is-active', async (run, masked) => {
  console.log(`--- profiles.is_active @ prod:${masked} (READ ONLY) ---`)
  const col = await run(`SELECT data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='is_active'`)
  console.log('kolonne:', JSON.stringify(col))
  const dist = await run(`SELECT coalesce(is_active::text, 'NULL') is_active, role::text, count(*)::int n FROM profiles GROUP BY 1, 2 ORDER BY 1, 2`)
  console.log('fordeling (is_active, rolle, antal):')
  for (const r of dist as Array<{ is_active: string; role: string; n: number }>) console.log(`  ${r.is_active.padEnd(6)} ${String(r.role).padEnd(14)} ${r.n}`)
  const nul = await run(`SELECT p.role::text, (u.id IS NOT NULL) har_auth_bruger, (u.banned_until IS NOT NULL AND u.banned_until > now()) spaerret,
      count(*)::int n, min(p.created_at)::date::text foerste, max(p.created_at)::date::text seneste,
      max(u.last_sign_in_at)::date::text seneste_login
    FROM profiles p LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.is_active IS NULL GROUP BY 1, 2, 3 ORDER BY 1`)
  console.log('is_active IS NULL — detaljer (rolle, har auth-bruger, spærret, antal, oprettet fra/til, seneste login):')
  if (!(nul as unknown[]).length) console.log('  (ingen)')
  for (const r of nul as Array<Record<string, unknown>>) console.log(`  ${JSON.stringify(r)}`)
  const recentLoginByState = await run(`SELECT coalesce(p.is_active::text, 'NULL') is_active, count(*) FILTER (WHERE u.last_sign_in_at > now() - interval '30 days')::int login_30d, count(*)::int n
    FROM profiles p LEFT JOIN auth.users u ON u.id = p.id GROUP BY 1 ORDER BY 1`)
  console.log('login seneste 30 dage pr. tilstand:', JSON.stringify(recentLoginByState))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
