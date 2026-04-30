import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0];

const pre = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='case_notes'" }),
});
const preRows = await pre.json();
if (Array.isArray(preRows) && preRows.length > 0) {
  console.log('case_notes already exists — skipping apply');
} else {
  const sql = fs.readFileSync('supabase/migrations/00073_case_notes.sql', 'utf8');
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  console.log('apply:', r.status, (await r.text()).substring(0, 200) || '(empty)');
}

const reload = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema';" }),
});
console.log('reload:', reload.status);

const verify = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='case_notes' ORDER BY ordinal_position;`,
  }),
});
const cols = await verify.json();
console.log('columns:', Array.isArray(cols) ? cols.map((c) => c.column_name).join(', ') : cols);
