/** PRODUCTION read-only: 00182 (D2) — log_audit_event bruger auth.uid() for bruger-sessioner. pre|post. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const phase = process.argv[2]
if (phase !== 'pre' && phase !== 'post') { console.error('brug: pre|post'); process.exit(2) }
withProdReadOnly(`prod-verify-00182 ${phase}`, async (run) => {
  const r = (await run(`SELECT p.prosrc src, p.prosecdef definer, p.proconfig::text cfg, has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'log_audit_event'`)) as Array<Record<string, any>>
  const fails: string[] = []
  if (r.length !== 1) fails.push(`forventede én log_audit_event, fandt ${r.length}`)
  const f = r[0] ?? {}
  const usesUid = /auth\.uid\(\)/.test(f.src ?? '')
  if (!f.definer) fails.push('ikke SECURITY DEFINER')
  if (f.anon_exec) fails.push('anon kan kalde funktionen')
  if (!f.auth_exec) fails.push('authenticated kan ikke kalde funktionen (createAuditLog ville fejle)')
  if (phase === 'pre' && usesUid) fails.push('bruger allerede auth.uid() — 00182 allerede kørt?')
  if (phase === 'post' && !usesUid) fails.push('bruger IKKE auth.uid() efter 00182')
  if (phase === 'post' && !/search_path/.test(f.cfg ?? '')) fails.push('search_path ikke låst')
  console.log(JSON.stringify({ phase, definer: f.definer, auth_uid: usesUid, search_path: f.cfg, anon_exec: f.anon_exec, auth_exec: f.auth_exec }))
  if (fails.length) { console.log(`❌ ${fails.join(' · ')}`); process.exitCode = 1 } else console.log(`✅ ${phase}: som forventet`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
