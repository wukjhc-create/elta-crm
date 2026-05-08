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

const admin = await q(`SELECT id FROM profiles WHERE role = 'admin' LIMIT 1;`)
console.log('admin pick:', admin.text)
const adminId = JSON.parse(admin.text)[0].id

console.log('\n--- helper function tests ---')
console.log('user_role(admin):', (await q(`SELECT user_role('${adminId}'::uuid) AS role;`)).text)
console.log('user_has_role([admin]):', (await q(`SELECT user_has_role(ARRAY['admin']::text[], '${adminId}'::uuid) AS has_role;`)).text)
console.log('user_has_permission(invoices.mark_paid):', (await q(`SELECT user_has_permission('invoices.mark_paid', '${adminId}'::uuid) AS has;`)).text)
console.log('user_has_permission(invoices.credit):', (await q(`SELECT user_has_permission('invoices.credit', '${adminId}'::uuid) AS has;`)).text)
console.log('user_has_permission(employees.payroll.edit):', (await q(`SELECT user_has_permission('employees.payroll.edit', '${adminId}'::uuid) AS has;`)).text)
console.log('user_permissions length:', (await q(`SELECT array_length(user_permissions('${adminId}'::uuid), 1) AS n;`)).text)
console.log('user_role(non-existent — fail-safe):', (await q(`SELECT user_role('00000000-0000-0000-0000-000000000000'::uuid) AS role;`)).text)
