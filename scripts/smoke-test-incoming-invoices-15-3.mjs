/**
 * Phase 15.3 smoke test — verify dedup invariants for API ingest.
 *
 *   1. Insert a "fake API-ingested" invoice via direct SQL
 *   2. Re-insert with same (supplier_id, invoice_number) → 23505
 *   3. Re-insert with same file_hash → 23505
 *   4. Confirm both UNIQUE indexes are still in place
 *   5. Cleanup
 *
 * The actual API calls (AOInvoiceAdapter.fetchInvoices,
 * LemvigInvoiceAdapter.fetchInvoices) need real credentials/endpoints
 * to exercise — this smoke verifies the DB-side guarantees the
 * orchestrator depends on.
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
  return { ok: r.ok, body };
}

const aoId = (await q(`SELECT id FROM suppliers WHERE UPPER(code)='AO' LIMIT 1;`)).body[0].id;
const lmId = (await q(`SELECT id FROM suppliers WHERE UPPER(code)='LM' LIMIT 1;`)).body[0].id;
console.log('AO id:', aoId, 'LM id:', lmId);

// 1. fake API ingest row for AO
const num1 = `API-AO-${Date.now()}`;
const hash1 = `phase153-hash-1-${Date.now()}`;
const inv1 = (await q(`
  INSERT INTO incoming_invoices (
    source, supplier_id, supplier_name_extracted, invoice_number,
    currency, amount_incl_vat, file_hash, parse_status, status, notes
  ) VALUES (
    'manual', '${aoId}'::uuid, 'AO', '${num1}', 'DKK', 1500.00,
    '${hash1}', 'pending', 'received', 'api-ingest:AO'
  ) RETURNING id, notes;
`)).body[0];
console.log('inv1:', inv1);

// 2. dup by (supplier_id, invoice_number)
const dup2 = await q(`
  INSERT INTO incoming_invoices (source, supplier_id, invoice_number, currency, status, file_hash)
  VALUES ('manual', '${aoId}'::uuid, '${num1}', 'DKK', 'received', 'phase153-hash-DIFFERENT-${Date.now()}')
  RETURNING id;
`);
console.log('dup by (supplier, invoice_number) (must be 23505):', dup2.body?.message?.split('\n')[0] || dup2.body);

// 3. dup by file_hash
const dup3 = await q(`
  INSERT INTO incoming_invoices (source, supplier_id, invoice_number, currency, status, file_hash)
  VALUES ('manual', '${aoId}'::uuid, 'API-AO-DIFFERENT-${Date.now()}', 'DKK', 'received', '${hash1}')
  RETURNING id;
`);
console.log('dup by file_hash (must be 23505):', dup3.body?.message?.split('\n')[0] || dup3.body);

// 4. confirm UNIQUE indexes still in place (should be from 00094)
const idx = (await q(`
  SELECT indexname FROM pg_indexes
   WHERE indexname IN ('uq_incoming_invoices_supplier_number','uq_incoming_invoices_file_hash')
   ORDER BY indexname;
`)).body;
console.log('unique indexes present:', idx);

// 5. notes field correctly identifies API source
const fromApi = (await q(`SELECT id, notes FROM incoming_invoices WHERE notes LIKE 'api-ingest:%' LIMIT 5;`)).body;
console.log('rows tagged with api-ingest notes:', fromApi.length);

// cleanup
await q(`DELETE FROM incoming_invoice_audit_log WHERE incoming_invoice_id='${inv1.id}'::uuid;`);
await q(`DELETE FROM incoming_invoices WHERE id='${inv1.id}'::uuid;`);
console.log('cleanup done');
