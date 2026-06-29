/**
 * Fase 2a — verify + negativ-tests for sekventiel besigtigelses-godkendelse
 * (kunde → partner) MED manuelt kontrolpunkt.
 *
 * Tester de PRÆCIS SAMME guard-queries som server-koden bruger:
 *   - submitConfirmation: UPDATE ... WHERE token=? AND status IN ('sent','opened') AND expires_at>now()
 *   - markNextChainStepReady: sætter metadata.readyToSend på næste pending-trin
 *   - sendReadyChainStep: UPDATE ... WHERE token=? AND status='pending' (kontorets videresend)
 *
 * Kerne-garantier der bevises:
 *   1. Partneren (trin 2) kan IKKE godkende/komme ind før kunden har godkendt.
 *   2. Selv EFTER kunden godkender forbliver trin 2 'pending' (frigivet, men
 *      ikke sendt) — partneren kan STADIG ikke komme ind før kontoret sender
 *      videre. Det er det manuelle kontrolpunkt.
 *   3. Udløbet trin 1 frigiver IKKE trin 2.
 *   4. Dobbelt-confirm er blokeret.
 *
 * SELV-OPRYDENDE: alt testdata slettes til sidst (0 drift mod prod).
 */
import fs from 'fs'
import crypto from 'crypto'

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
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { throw new Error(`SQL-svar ikke JSON: ${text.slice(0, 300)}`) }
  if (json && json.error) throw new Error(`SQL-fejl: ${json.error} | ${sql.slice(0, 120)}`)
  return json
}

let fail = 0
const ok = (c, m) => { console.log(`${c ? '✓' : '✗ FEJL'} ${m}`); if (!c) fail++ }

// Replikér computePublicState fra document-confirmations.ts (det partneren ser)
function publicState(status, expiresAt) {
  if (status === 'confirmed') return 'already_confirmed'
  if (status === 'revoked') return 'revoked'
  if (status === 'pending' || status === 'failed') return 'invalid'
  if (new Date(expiresAt).getTime() < Date.now()) return 'expired'
  return 'awaiting'
}

const uid = () => crypto.randomUUID()
const tok = () => crypto.randomBytes(32).toString('hex')
const short = crypto.randomBytes(3).toString('hex')

// Test-id'er
const C1 = uid() // anlægsejer (primær kunde)
const DOC = uid()
const T1 = tok(), T2 = tok()        // kæde A: trin1=kunde, trin2=partner
const CH = uid()
const T1b = tok(), T2b = tok()      // kæde B (negativ): udløbet trin 1
const CHb = uid()

async function cleanup() {
  try {
    await q(`DELETE FROM document_confirmations WHERE customer_document_id='${DOC}';`)
    await q(`DELETE FROM customer_documents WHERE id='${DOC}';`)
    await q(`DELETE FROM customers WHERE id='${C1}';`)
  } catch (e) {
    console.log(`(advarsel: oprydning fejlede delvist: ${e.message})`)
  }
}

try {
  // Find gyldige FK-værdier (created_by → profiles, shared_by → auth.users)
  const prof = await q(`SELECT id FROM profiles LIMIT 1;`)
  const usr = await q(`SELECT id FROM auth.users LIMIT 1;`)
  const profileId = prof[0]?.id
  const userId = usr[0]?.id
  if (!profileId || !userId) throw new Error('Mangler profile/auth.users til FK')

  // 1) Opret test-kunde + dokument
  await q(`INSERT INTO customers (id, customer_number, company_name, contact_person, email, created_by)
           VALUES ('${C1}','TEST-SEQ-${short}','TEST Sekvens ApS','Test Anlægsejer','test-seq-${short}@example.invalid','${profileId}');`)
  await q(`INSERT INTO customer_documents (id, customer_id, title, description, document_type, file_url, storage_path, file_name, mime_type, file_size, shared_by)
           VALUES ('${DOC}','${C1}','TEST besigtigelse','{}','besigtigelse','','customer-documents/${C1}/test.pdf','test.pdf','application/pdf',0,'${userId}');`)

  // Kæde A: trin1 (kunde) sent + ikke-udløbet, trin2 (partner) pending
  await q(`INSERT INTO document_confirmations (customer_document_id, token, recipient_type, recipient_email, recipient_role, status, expires_at, metadata)
           VALUES ('${DOC}','${T1}','customer','kunde-${short}@example.invalid','end_customer','sent', now()+interval '30 days',
                   '{"sequence":{"chainId":"${CH}","order":1,"gated":true}}'::jsonb);`)
  await q(`INSERT INTO document_confirmations (customer_document_id, token, recipient_type, recipient_email, recipient_role, status, expires_at, metadata)
           VALUES ('${DOC}','${T2}','customer','partner-${short}@example.invalid','payer','pending', now()+interval '30 days',
                   '{"sequence":{"chainId":"${CH}","order":2,"gated":true}}'::jsonb);`)

  const s0 = await q(`SELECT token,status,expires_at,metadata FROM document_confirmations WHERE token IN ('${T1}','${T2}') ORDER BY (metadata->'sequence'->>'order')::int;`)
  ok(s0.length === 2 && s0[0].status === 'sent' && s0[1].status === 'pending', `kæde oprettet: trin1=${s0[0]?.status}, trin2=${s0[1]?.status}`)

  // 2) KERNE-NEGATIV: partneren kan IKKE godkende trin 2 før kunden (submit-guard → 0 rækker)
  const p1 = await q(`UPDATE document_confirmations SET status='confirmed', confirmed_at=now()
                      WHERE token='${T2}' AND status IN ('sent','opened') AND expires_at>now() RETURNING id;`)
  ok(p1.length === 0, `NEGATIV: partner (trin 2) kan IKKE godkende før kunden — submit-guard afviste (${p1.length} rækker)`)

  // 3) Partnerens public-state før kundens godkendelse = invalid (ingen dokument-læk)
  const row2 = await q(`SELECT status,expires_at FROM document_confirmations WHERE token='${T2}';`)
  ok(publicState(row2[0].status, row2[0].expires_at) === 'invalid',
     `partnerens link er 'invalid' før kundens godkendelse (status=${row2[0].status})`)

  // 4) Kunden godkender trin 1 (samme atomiske guard som submitConfirmation)
  const c1 = await q(`UPDATE document_confirmations SET status='confirmed', confirmed_at=now()
                      WHERE token='${T1}' AND status IN ('sent','opened') AND expires_at>now() RETURNING id;`)
  ok(c1.length === 1, `kunden (trin 1) kunne godkende — guard tillod (${c1.length} række)`)

  // 5) markNextChainStepReady frigiver trin 2, men sender IKKE (forbliver pending)
  const rel = await q(`UPDATE document_confirmations
                       SET metadata = metadata || '{"readyToSend":true,"readyAt":"now"}'::jsonb
                       WHERE customer_document_id='${DOC}' AND status='pending'
                         AND metadata->'sequence'->>'chainId'='${CH}'
                         AND (metadata->'sequence'->>'order')::int = 2 RETURNING id;`)
  const afterRel = await q(`SELECT status, metadata->>'readyToSend' AS ready FROM document_confirmations WHERE token='${T2}';`)
  ok(rel.length === 1 && afterRel[0].status === 'pending' && afterRel[0].ready === 'true',
     `trin 2 FRIGIVET men stadig 'pending' (readyToSend=${afterRel[0].ready}, status=${afterRel[0].status}) — manuelt kontrolpunkt`)

  // 6) KERNE-NEGATIV: selv efter frigivelse kan partneren STADIG ikke komme ind (stadig pending)
  const p2 = await q(`UPDATE document_confirmations SET status='confirmed', confirmed_at=now()
                      WHERE token='${T2}' AND status IN ('sent','opened') AND expires_at>now() RETURNING id;`)
  const ps2 = await q(`SELECT status,expires_at FROM document_confirmations WHERE token='${T2}';`)
  ok(p2.length === 0 && publicState(ps2[0].status, ps2[0].expires_at) === 'invalid',
     `NEGATIV: partner kan STADIG ikke komme ind efter frigivelse (stadig 'invalid' indtil kontoret sender) — guard afviste (${p2.length})`)

  // 7) Kontoret sender videre (sendReadyChainStep) → trin 2 bliver 'sent' → partneren kan NU komme ind
  const snd = await q(`UPDATE document_confirmations SET status='sent', mail_sent_at=now()
                       WHERE token='${T2}' AND status='pending' RETURNING id;`)
  const ps3 = await q(`SELECT status,expires_at FROM document_confirmations WHERE token='${T2}';`)
  ok(snd.length === 1 && publicState(ps3[0].status, ps3[0].expires_at) === 'awaiting',
     `efter kontorets 'send videre' er trin 2 'sent' → partnerens link bliver 'awaiting' (status=${ps3[0].status})`)

  // 8) NEGATIV: udløbet trin 1 frigiver IKKE trin 2
  await q(`INSERT INTO document_confirmations (customer_document_id, token, recipient_type, recipient_email, recipient_role, status, expires_at, metadata)
           VALUES ('${DOC}','${T1b}','customer','kunde2-${short}@example.invalid','end_customer','sent', now()-interval '1 day',
                   '{"sequence":{"chainId":"${CHb}","order":1,"gated":true}}'::jsonb);`)
  await q(`INSERT INTO document_confirmations (customer_document_id, token, recipient_type, recipient_email, recipient_role, status, expires_at, metadata)
           VALUES ('${DOC}','${T2b}','customer','partner2-${short}@example.invalid','payer','pending', now()+interval '30 days',
                   '{"sequence":{"chainId":"${CHb}","order":2,"gated":true}}'::jsonb);`)
  const cExp = await q(`UPDATE document_confirmations SET status='confirmed', confirmed_at=now()
                        WHERE token='${T1b}' AND status IN ('sent','opened') AND expires_at>now() RETURNING id;`)
  const rdy2b = await q(`SELECT status, metadata->>'readyToSend' AS ready FROM document_confirmations WHERE token='${T2b}';`)
  ok(cExp.length === 0 && rdy2b[0].status === 'pending' && (rdy2b[0].ready === null),
     `NEGATIV: udløbet trin 1 kunne ikke godkendes (${cExp.length}) → trin 2 IKKE frigivet (ready=${rdy2b[0].ready})`)

  // 9) NEGATIV: dobbelt-confirm blokeret (trin 1 er allerede 'confirmed')
  const dbl = await q(`UPDATE document_confirmations SET status='confirmed', confirmed_at=now()
                       WHERE token='${T1}' AND status IN ('sent','opened') AND expires_at>now() RETURNING id;`)
  ok(dbl.length === 0, `NEGATIV: dobbelt-confirm af trin 1 blokeret af atomisk guard (${dbl.length} rækker)`)
} catch (e) {
  ok(false, `uventet fejl: ${e.message}`)
} finally {
  await cleanup()
  const verify = await q(`SELECT COUNT(*) AS n FROM customers WHERE id='${C1}';`).catch(() => [{ n: '?' }])
  ok(Number(verify[0]?.n) === 0, `oprydning: testdata slettet (customers tilbage=${verify[0]?.n})`)
}

console.log(`\n${fail === 0 ? '✅ SEKVENS-VERIFY GRØN' : `❌ ${fail} fejl`}`)
process.exit(fail === 0 ? 0 : 1)
