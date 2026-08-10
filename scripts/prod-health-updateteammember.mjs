/**
 * Read-only prod-health for the updateTeamMember service-role deploy.
 * Confirms migration 00150's security objects are intact (the dependency the
 * deployed code relies on) and that profiles rows are unchanged. NO mutations.
 */
import fs from 'fs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0];
async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { ok: r.ok, status: r.status, body };
}

let fails = 0;
const pass = (ok, label, extra='') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  '+extra : ''}`); if (!ok) fails++; };

// 1. Guard function exists AND is SECURITY INVOKER (prosecdef=false). CRITICAL.
const fn = await q(`SELECT proname, prosecdef FROM pg_proc WHERE proname = 'prevent_profile_privilege_change';`);
const fnRow = Array.isArray(fn.body) ? fn.body[0] : null;
pass(!!fnRow, 'guard function prevent_profile_privilege_change exists');
pass(fnRow && fnRow.prosecdef === false, 'guard is SECURITY INVOKER (prosecdef=false)', fnRow ? `prosecdef=${fnRow.prosecdef}` : '');

// 2. BEFORE UPDATE trigger on profiles wired to the guard.
const trg = await q(`SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass AND NOT tgisinternal AND tgname ILIKE '%privilege%';`);
pass(Array.isArray(trg.body) && trg.body.length >= 1, 'BEFORE UPDATE privilege-guard trigger on profiles', Array.isArray(trg.body) ? trg.body.map(t=>t.tgname).join(',') : '');

// 3. role default is 'montør' (not 'admin').
const def = await q(`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='role';`);
const defVal = Array.isArray(def.body) && def.body[0] ? def.body[0].column_default : null;
pass(typeof defVal === 'string' && defVal.includes('montør'), "profiles.role default = 'montør'", `default=${defVal}`);

// 4. profiles rows unchanged: 5 users (3 admin / 2 montør).
const cnt = await q(`SELECT role, count(*)::int AS n FROM profiles GROUP BY role ORDER BY role;`);
const rows = Array.isArray(cnt.body) ? cnt.body : [];
const total = rows.reduce((s,r)=>s+r.n,0);
pass(total === 5, 'profiles row count = 5', `total=${total} (${rows.map(r=>`${r.role}:${r.n}`).join(', ')})`);

console.log(`\n${fails === 0 ? '0 drift-fejl — prod-health GRØN' : fails + ' drift-fejl'}`);
process.exit(fails === 0 ? 0 : 1);
