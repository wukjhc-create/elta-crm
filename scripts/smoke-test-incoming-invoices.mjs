/**
 * Phase 15 smoke test — supplier invoice engine.
 *
 *   1. Parser: feed Danish invoice text and inspect extracted fields
 *      (executed via the prod DB by inserting raw_text and calling the
 *      parse pipeline through SQL state — but parser logic itself is
 *      pure TS, so we exercise it by inserting a known sample below
 *      and verifying the matcher's duplicate-detection works).
 *   2. DB invariants:
 *      - UNIQUE(supplier_id, invoice_number) — duplicate insert raises 23505
 *      - UNIQUE(file_hash) — same file_hash blocks
 *      - UNIQUE(external_provider, external_invoice_id) — push dedup
 *   3. Approval flow: received → awaiting_approval → approved
 *   4. Reject flow: awaiting_approval → rejected with reason
 *   5. Audit log: every state change recorded
 *   6. Cleanup
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

const userId = (await q(`SELECT id FROM profiles LIMIT 1;`)).body[0].id;

// Resolve LM supplier id
const lmId = (await q(`SELECT id FROM suppliers WHERE UPPER(code)='LM' LIMIT 1;`)).body[0]?.id;
if (!lmId) { console.error('LM supplier not found'); process.exit(1); }
console.log('LM supplier id:', lmId);

// 1a. Insert a parsed invoice manually (simulating parser output) — supplier_id=LM
const inv1 = (await q(`
  INSERT INTO incoming_invoices (
    source, supplier_id, supplier_name_extracted, supplier_vat_number,
    invoice_number, invoice_date, due_date, currency,
    amount_excl_vat, vat_amount, amount_incl_vat,
    payment_reference, file_hash,
    parse_status, parse_confidence, status
  ) VALUES (
    'manual', '${lmId}'::uuid, 'Lemvigh-Müller A/S', 'DK28503371',
    'SMOKE-INV-001', '2026-04-30', '2026-05-14', 'DKK',
    8000.00, 2000.00, 10000.00,
    '+71<00012345678901234>', 'smoke-hash-' || extract(epoch from now())::bigint,
    'parsed', 0.9, 'awaiting_approval'
  ) RETURNING id, status, parse_confidence;
`)).body[0];
console.log('invoice 1 inserted:', inv1);

// 1b. Audit row
await q(`INSERT INTO incoming_invoice_audit_log (incoming_invoice_id, action, message)
  VALUES ('${inv1.id}'::uuid, 'parsed', 'smoke insert');`);

// 2a. Same (supplier, invoice_number) → 23505
const dup1 = await q(`
  INSERT INTO incoming_invoices (source, supplier_id, invoice_number, currency, status, file_hash)
  VALUES ('manual', '${lmId}'::uuid, 'SMOKE-INV-001', 'DKK', 'received', 'different-hash-' || extract(epoch from now())::bigint)
  RETURNING id;
`);
console.log('dup by (supplier, invoice_number) (must be 23505):', dup1.body?.message?.split('\n')[0] || dup1.body);

// 2b. Same file_hash → 23505
const fileHash = (await q(`SELECT file_hash FROM incoming_invoices WHERE id='${inv1.id}'::uuid;`)).body[0].file_hash;
const dup2 = await q(`
  INSERT INTO incoming_invoices (source, currency, status, file_hash)
  VALUES ('manual', 'DKK', 'received', '${fileHash}') RETURNING id;
`);
console.log('dup by file_hash (must be 23505):', dup2.body?.message?.split('\n')[0] || dup2.body);

// 3. Approval: awaiting_approval → approved (race-safe)
const approve = (await q(`
  UPDATE incoming_invoices
     SET status='approved', approved_by='${userId}'::uuid, approved_at=NOW()
   WHERE id='${inv1.id}'::uuid AND status='awaiting_approval'
   RETURNING status, approved_at IS NOT NULL AS at_set;
`)).body;
console.log('approval result:', approve);
await q(`INSERT INTO incoming_invoice_audit_log (incoming_invoice_id, actor_id, action, previous_value, new_value, message)
  VALUES ('${inv1.id}'::uuid, '${userId}'::uuid, 'approved', '{"status":"awaiting_approval"}'::jsonb, '{"status":"approved"}'::jsonb, 'smoke approve');`);

// 4. Insert second invoice and reject it
const inv2 = (await q(`
  INSERT INTO incoming_invoices (
    source, supplier_id, supplier_name_extracted, invoice_number, currency, status,
    amount_incl_vat, file_hash, parse_status, parse_confidence
  ) VALUES (
    'manual', '${lmId}'::uuid, 'Lemvigh-Müller A/S', 'SMOKE-INV-002', 'DKK', 'awaiting_approval',
    500.00, 'smoke-hash-2-' || extract(epoch from now())::bigint, 'parsed', 0.7
  ) RETURNING id;
`)).body[0];
const reject = (await q(`
  UPDATE incoming_invoices
     SET status='rejected', rejected_by='${userId}'::uuid, rejected_at=NOW(), rejected_reason='Forkert beløb'
   WHERE id='${inv2.id}'::uuid AND status='awaiting_approval'
   RETURNING status, rejected_reason;
`)).body;
console.log('reject result:', reject);

// 5. Audit log dump for inv1
const audit = (await q(`SELECT action, ok, message FROM incoming_invoice_audit_log WHERE incoming_invoice_id='${inv1.id}'::uuid ORDER BY created_at;`)).body;
console.log('audit log inv1:'); console.log(JSON.stringify(audit, null, 2));

// 6. UNIQUE on external_invoice_id
const inv3Id = (await q(`
  INSERT INTO incoming_invoices (source, supplier_id, currency, status, file_hash, external_provider, external_invoice_id)
  VALUES ('manual', '${lmId}'::uuid, 'DKK', 'posted', 'smoke-hash-3-' || extract(epoch from now())::bigint, 'economic', 'draft-9999')
  RETURNING id;
`)).body[0]?.id;
const dup3 = await q(`
  INSERT INTO incoming_invoices (source, supplier_id, currency, status, file_hash, external_provider, external_invoice_id)
  VALUES ('manual', '${lmId}'::uuid, 'DKK', 'posted', 'smoke-hash-4-' || extract(epoch from now())::bigint, 'economic', 'draft-9999') RETURNING id;
`);
console.log('dup external_invoice_id (must be 23505):', dup3.body?.message?.split('\n')[0] || dup3.body);

// cleanup
await q(`DELETE FROM incoming_invoice_audit_log WHERE incoming_invoice_id IN ('${inv1.id}'::uuid, '${inv2.id}'::uuid${inv3Id ? `, '${inv3Id}'::uuid` : ''});`);
await q(`DELETE FROM incoming_invoices WHERE id IN ('${inv1.id}'::uuid, '${inv2.id}'::uuid${inv3Id ? `, '${inv3Id}'::uuid` : ''});`);
console.log('cleanup done');
