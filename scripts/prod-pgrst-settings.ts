/** PRODUCTION read-only: PostgREST-indstillinger på authenticator-rollen (fx pgrst.db_max_rows).  npx tsx scripts/prod-pgrst-settings.ts */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-pgrst-settings', async (run) => {
  const r = await run(`SELECT coalesce(json_agg(s), '[]'::json) j FROM (SELECT r.rolname, unnest(d.setconfig) s FROM pg_db_role_setting d JOIN pg_roles r ON r.oid = d.setrole WHERE r.rolname IN ('authenticator', 'anon', 'authenticated', 'service_role')) x`)
  console.log(JSON.stringify(r[0].j))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
