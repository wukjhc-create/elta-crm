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

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  try { return { status: r.status, body: JSON.parse(text) }; } catch { return { status: r.status, body: text }; }
}

// 1) pick any package
const pkg = await q(`SELECT id, slug FROM offer_packages WHERE is_active=true ORDER BY created_at LIMIT 1;`);
console.log('package:', pkg.body);
const packageId = pkg.body[0]?.id;
if (!packageId) { console.error('no active package'); process.exit(1); }

// 2) pick a real supplier_product (any in stock with cost > 0)
const sp = await q(`SELECT id AS supplier_product_id, supplier_id, supplier_name AS product_name, cost_price, unit FROM supplier_products WHERE cost_price > 0 LIMIT 1;`);
console.log('supplier_product:', sp.body);
const sample = sp.body[0];
if (!sample) { console.error('no supplier products'); process.exit(1); }

// 3) create a throwaway offer (no customer)
const anyUser = await q(`SELECT id FROM profiles LIMIT 1;`);
const userId = anyUser.body[0]?.id;
const offer = await q(`INSERT INTO offers (offer_number, status, title, description, created_by) VALUES ('SMOKE-' || extract(epoch from now())::bigint, 'draft', '[smoke] apply_package RPC', 'temp test row', '${userId}'::uuid) RETURNING id;`);
console.log('offer:', offer.body);
const offerId = offer.body[0]?.id;
if (!offerId) { console.error('offer insert failed'); process.exit(1); }

// 4) call the RPC with a single synthetic line
const lines = [{
  material_id: null,
  supplier_id: sample.supplier_id,
  supplier_product_id: sample.supplier_product_id,
  supplier_name: 'SMOKE',
  category: 'general',
  sub_category: null,
  section: 'Materialer',
  description: '[smoke] ' + (sample.product_name || 'test'),
  unit: sample.unit || 'stk',
  quantity: 1,
  cost_price: Number(sample.cost_price),
  notes: 'smoke test 00079'
}];

const call = await q(`SELECT apply_package_to_offer('${offerId}'::uuid, '${packageId}'::uuid, NULL, '${JSON.stringify(lines).replace(/'/g, "''")}'::jsonb) AS inserted;`);
console.log('rpc call:', call.body);

// 5) verify line was inserted with sale_price > 0 and total > 0
const ver = await q(`SELECT id, description, quantity, cost_price, margin_percentage, sale_price, total FROM offer_line_items WHERE offer_id = '${offerId}'::uuid;`);
console.log('inserted line:', ver.body);

// 6) cleanup
const cleanup = await q(`DELETE FROM offer_line_items WHERE offer_id = '${offerId}'::uuid; DELETE FROM offers WHERE id = '${offerId}'::uuid;`);
console.log('cleanup:', cleanup.status);
