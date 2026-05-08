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
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  return { status: r.status, text: await r.text() }
}

console.log('=== profiles columns ===')
console.log((await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position;`)).text)

console.log('\n=== employees columns (focus profile_id + active) ===')
console.log((await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name IN ('id','profile_id','active','role','name','email') ORDER BY ordinal_position;`)).text)

console.log('\n=== work_orders columns (focus assigned + case) ===')
console.log((await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='work_orders' AND column_name IN ('id','case_id','customer_id','assigned_employee_id','status','scheduled_date') ORDER BY ordinal_position;`)).text)

console.log('\n=== service_cases columns (focus assigned + created_by) ===')
console.log((await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='service_cases' AND column_name IN ('id','case_number','customer_id','assigned_to','created_by','status') ORDER BY ordinal_position;`)).text)

console.log('\n=== time_logs columns (focus employee + work_order) ===')
console.log((await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='time_logs' AND column_name IN ('id','employee_id','work_order_id') ORDER BY ordinal_position;`)).text)

console.log('\n=== case_materials columns (focus case + work_order) ===')
console.log((await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='case_materials' AND column_name IN ('id','case_id','work_order_id','created_by') ORDER BY ordinal_position;`)).text)

console.log('\n=== case_other_costs columns (focus case + work_order) ===')
console.log((await q(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='case_other_costs' AND column_name IN ('id','case_id','work_order_id','created_by') ORDER BY ordinal_position;`)).text)

console.log('\n=== mig 00108 helper functions present ===')
console.log((await q(`SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('user_role','user_has_role','user_has_permission','user_permissions','user_employee_id') ORDER BY proname;`)).text)

console.log('\n=== schema gaps check: service_case_members table? ===')
console.log((await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('service_case_members','case_assignments','team_members','teams') ORDER BY table_name;`)).text)

console.log('\n=== sample data: how many montor profiles + employees? ===')
console.log((await q(`SELECT role, COUNT(*) FROM profiles WHERE is_active = true GROUP BY role ORDER BY role;`)).text)
console.log((await q(`SELECT 'employees with profile_id' AS k, COUNT(*) FROM employees WHERE profile_id IS NOT NULL AND active = true UNION ALL SELECT 'employees without profile_id', COUNT(*) FROM employees WHERE profile_id IS NULL AND active = true;`)).text)

console.log('\n=== sample work_orders.assigned_employee_id distribution ===')
console.log((await q(`SELECT
  COUNT(*) FILTER (WHERE assigned_employee_id IS NOT NULL) AS assigned,
  COUNT(*) FILTER (WHERE assigned_employee_id IS NULL) AS unassigned,
  COUNT(*) AS total
FROM work_orders;`)).text)

console.log('\n=== sample service_cases.assigned_to + created_by distribution ===')
console.log((await q(`SELECT
  COUNT(*) FILTER (WHERE assigned_to IS NOT NULL) AS has_assigned_to,
  COUNT(*) FILTER (WHERE created_by IS NOT NULL) AS has_created_by,
  COUNT(*) AS total
FROM service_cases;`)).text)
