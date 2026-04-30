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

const sql = fs.readFileSync('supabase/migrations/00078_offer_packages.sql', 'utf8');
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
      SELECT p.slug, p.job_type, p.name,
             json_agg(json_build_object('material', m.slug, 'qty_mult', pi.quantity_multiplier, 'pos', pi.position) ORDER BY pi.position) AS items
        FROM offer_packages p
        LEFT JOIN offer_package_items pi ON pi.package_id = p.id
        LEFT JOIN materials m ON m.id = pi.material_id
       GROUP BY p.id ORDER BY p.job_type, p.slug;
    `,
  }),
});
console.log('packages:', JSON.stringify(await verify.json(), null, 2));
