import fs from 'fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  return { status: r.status, text: await r.text() }
}

console.log('=== PRE-MIGRATION SNAPSHOT ===')
const preAdmins = await q(`SELECT email, role FROM profiles WHERE role = 'admin' ORDER BY email;`)
console.log('admins (pre):', preAdmins.text)
const preTables = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('permissions','role_permissions') ORDER BY table_name;`)
console.log('rbac tables (pre):', preTables.text)

console.log('\n=== APPLYING MIGRATION 00108 ===')
const sql = fs.readFileSync('supabase/migrations/00108_rbac_foundation.sql', 'utf8')
const r = await q(sql)
console.log('apply status:', r.status)
console.log('apply body:', r.text.substring(0, 1500) || '(empty)')
await q("NOTIFY pgrst, 'reload schema';")

console.log('\n=== POST-MIGRATION VERIFICATION ===')

const adminsAfter = await q(`SELECT email, role FROM profiles WHERE role = 'admin' ORDER BY email;`)
console.log('admins (post — uaendret):', adminsAfter.text)

const permsCount = await q(`SELECT COUNT(*) AS total FROM permissions;`)
console.log('permissions count:', permsCount.text)

const permsByModule = await q(`SELECT module, COUNT(*) FROM permissions GROUP BY module ORDER BY module;`)
console.log('permissions by module:', permsByModule.text)

const rolePermsCount = await q(`SELECT role, COUNT(*) AS perm_count FROM role_permissions GROUP BY role ORDER BY role;`)
console.log('role_permissions count:', rolePermsCount.text)

const adminAllPerms = await q(`
  SELECT
    (SELECT COUNT(*) FROM permissions) AS total_perms,
    (SELECT COUNT(*) FROM role_permissions WHERE role = 'admin') AS admin_perms,
    (SELECT COUNT(*) FROM permissions) = (SELECT COUNT(*) FROM role_permissions WHERE role = 'admin') AS admin_has_all;
`)
console.log('admin coverage:', adminAllPerms.text)

const helpers = await q(`
  SELECT proname, pronargs FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('user_role','user_has_role','user_has_permission','user_permissions','user_employee_id')
  ORDER BY proname;
`)
console.log('helper functions created:', helpers.text)

const idx = await q(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('idx_profiles_role','idx_permissions_module','idx_role_permissions_role','idx_role_permissions_perm') ORDER BY indexname;`)
console.log('indexes:', idx.text)

console.log('\n=== UNCHANGED VERIFICATION ===')

const portalPolicies = await q(`
  SELECT polname, polrelid::regclass::text AS table_name
  FROM pg_policy
  WHERE polrelid IN ('portal_messages'::regclass, 'offer_signatures'::regclass, 'portal_access_tokens'::regclass)
  ORDER BY table_name, polname;
`)
console.log('portal-related policies (skal vare uaendret):', portalPolicies.text)

const moduleRls = await q(`
  SELECT polrelid::regclass::text AS table_name, COUNT(*) AS policy_count
  FROM pg_policy
  WHERE polrelid IN ('invoices'::regclass, 'service_cases'::regclass, 'employees'::regclass, 'work_orders'::regclass, 'time_logs'::regclass)
  GROUP BY polrelid::regclass::text
  ORDER BY table_name;
`)
console.log('module RLS policy counts (skal vare uaendret):', moduleRls.text)
