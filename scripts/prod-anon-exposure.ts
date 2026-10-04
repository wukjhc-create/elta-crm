/**
 * PRODUCTION read-only (sikkerhedsreview Q10): findes der anon-policies/-grants der giver adgang til interne tabeller?
 * Kun policy-/tabelnavne og antal — ingen rækkedata.
 *   npx tsx scripts/prod-anon-exposure.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-anon-exposure', async (run) => {
  const r = (await run(`SELECT json_build_object(
    'anon_policies', (SELECT coalesce(json_agg(json_build_object('t', tablename, 'p', policyname, 'cmd', cmd, 'qual', qual) ORDER BY tablename), '[]'::json)
      FROM pg_policies WHERE schemaname = 'public' AND ('anon' = ANY(roles) OR 'public' = ANY(roles))),
    'anon_write_grants', (SELECT coalesce(json_agg(DISTINCT table_name), '[]'::json) FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND table_schema = 'public' AND privilege_type IN ('INSERT','UPDATE','DELETE')),
    'customer_tasks_anon_grants', (SELECT coalesce(json_agg(privilege_type), '[]'::json) FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = 'customer_tasks')
  ) r`))[0].r
  console.log(JSON.stringify(r, null, 1))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
