/**
 * Apply migration 00072_email_intelligence_logs.sql via Supabase Management API.
 *
 * Auth: SUPABASE_ACCESS_TOKEN (PAT) from .env.local
 * Verifies both tables exist via PostgREST after applying.
 *
 * Usage: node scripts/apply-migration-00072.mjs
 */

import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL || !SERVICE_KEY || !ACCESS_TOKEN) {
  console.error('Missing one of: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
const sql = fs.readFileSync('supabase/migrations/00072_email_intelligence_logs.sql', 'utf8');

console.log(`\n=== Apply 00072 to project ${projectRef} ===\n`);
console.log(`SQL bytes: ${sql.length}\n`);

console.log('1. Executing migration via Management API...');
const exec = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const execText = await exec.text();
if (!exec.ok) {
  console.error(`   FAILED (${exec.status}):`, execText.substring(0, 600));
  process.exit(1);
}
console.log(`   OK (${exec.status}). Response:`, execText.substring(0, 200) || '(empty)');

console.log('\n2. Verifying email_intelligence_logs...');
const v1 = await fetch(
  `${SUPABASE_URL}/rest/v1/email_intelligence_logs?select=id&limit=1`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
);
console.log(`   Status: ${v1.status} ${v1.ok ? 'OK — table exists' : 'NOT FOUND'}`);
if (!v1.ok) console.log('   Body:', (await v1.text()).substring(0, 200));

console.log('\n3. Verifying email_intelligence_daily_summary...');
const v2 = await fetch(
  `${SUPABASE_URL}/rest/v1/email_intelligence_daily_summary?select=id&limit=1`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
);
console.log(`   Status: ${v2.status} ${v2.ok ? 'OK — table exists' : 'NOT FOUND'}`);
if (!v2.ok) console.log('   Body:', (await v2.text()).substring(0, 200));

console.log('\n4. Verifying schema columns via Management API...');
const colsCheck = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `
      SELECT table_name, column_name, data_type
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('email_intelligence_logs','email_intelligence_daily_summary')
       ORDER BY table_name, ordinal_position;
    `,
  }),
});
if (colsCheck.ok) {
  const cols = await colsCheck.json();
  console.log(`   Columns found: ${Array.isArray(cols) ? cols.length : 'unknown'}`);
  if (Array.isArray(cols)) {
    for (const c of cols) console.log(`     - ${c.table_name}.${c.column_name} :: ${c.data_type}`);
  }
} else {
  console.log('   Column check failed:', (await colsCheck.text()).substring(0, 200));
}

const ok = v1.ok && v2.ok;
console.log(`\n=== ${ok ? 'DONE — migration applied & verified' : 'PARTIAL — verify manually'} ===\n`);
process.exit(ok ? 0 : 2);
