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

const sql = fs.readFileSync('supabase/migrations/00074_phase1_dedup_and_ai_cap.sql', 'utf8');
console.log(`=== Apply 00074 to ${ref} ===\nSQL bytes: ${sql.length}\n`);

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
console.log('apply:', r.status, (await r.text()).substring(0, 400) || '(empty)');

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
    query: `
      SELECT 'offers.source_email_id' AS what,
             EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema='public' AND table_name='offers' AND column_name='source_email_id')::text AS ok
      UNION ALL SELECT 'uq_service_cases_source_email_id',
             EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_service_cases_source_email_id')::text
      UNION ALL SELECT 'uq_offers_source_email_id',
             EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_offers_source_email_id')::text
      UNION ALL SELECT 'ai_usage_daily',
             EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_usage_daily')::text;
    `,
  }),
});
console.log('verify:', await verify.json());
