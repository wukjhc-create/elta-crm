/**
 * Phase 12 smoke — sales engine.
 *
 *   1. Update an existing seeded package: set base_price + standard_text
 *   2. Insert two options
 *   3. Verify reads return the package with options
 *   4. Cleanup option rows + revert package
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
  return { status: r.status, body };
}

// 1. seeded packages from 00078
const seeded = (await q(`SELECT id, slug, name, job_type, base_price, standard_text, is_active FROM offer_packages ORDER BY slug;`)).body;
console.log('seeded packages:'); console.log(JSON.stringify(seeded, null, 2));

const solar = seeded.find((p) => p.slug === 'solar_basic');
if (!solar) { console.error('missing solar_basic package'); process.exit(1); }

// 2. update solar_basic with sales fields
await q(`UPDATE offer_packages SET base_price=89000, standard_text='Standard 6 kWp solcelleanlæg inkl. installation' WHERE id='${solar.id}'::uuid;`);
const updated = (await q(`SELECT base_price, standard_text FROM offer_packages WHERE id='${solar.id}'::uuid;`)).body;
console.log('after update:', updated);

// 3. insert two options
const opt1 = (await q(`INSERT INTO package_options (package_id, name, description, offer_text, price, affects_materials, sort_order)
  VALUES ('${solar.id}'::uuid, 'Batteri 5 kWh', 'Lithium batterilager', '5 kWh batterilager til natbrug', 32000, true, 1) RETURNING id, name, price;`)).body[0];
const opt2 = (await q(`INSERT INTO package_options (package_id, name, description, offer_text, price, affects_materials, sort_order)
  VALUES ('${solar.id}'::uuid, 'Servicepakke 5 år', 'Årligt eftersyn', 'Inkluderer årligt eftersyn i 5 år', 7500, false, 2) RETURNING id, name, price;`)).body[0];
console.log('options inserted:', opt1, opt2);

// 4. verify joined read (mirrors getPackageWithOptions)
const joined = (await q(`
  SELECT p.id, p.name, p.base_price, p.standard_text,
    COALESCE(json_agg(json_build_object(
      'id', o.id, 'name', o.name, 'price', o.price, 'offer_text', o.offer_text, 'affects', o.affects_materials
    ) ORDER BY o.sort_order) FILTER (WHERE o.id IS NOT NULL), '[]'::json) AS options
    FROM offer_packages p
    LEFT JOIN package_options o ON o.package_id = p.id AND o.is_active=true
   WHERE p.id='${solar.id}'::uuid
   GROUP BY p.id;
`)).body;
console.log('joined read:'); console.log(JSON.stringify(joined, null, 2));

// 5. text builder pre-flight (just confirm seeded blocks are present)
const blocks = (await q(`SELECT slug, content FROM sales_text_blocks WHERE slug IN ('offer_intro_default','offer_closing_default') ORDER BY slug;`)).body;
console.log('text blocks:'); console.log(JSON.stringify(blocks, null, 2));

// cleanup
await q(`DELETE FROM package_options WHERE id IN ('${opt1.id}'::uuid, '${opt2.id}'::uuid);`);
await q(`UPDATE offer_packages SET base_price=0, standard_text=NULL WHERE id='${solar.id}'::uuid;`);
console.log('cleanup done');
