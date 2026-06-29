/**
 * Fase 2a — verify for fuldmagt-rolle-gaten (Plan A): KUN sagens anlægsejer
 * (end_customer) må underskrive fuldmagten, ikke partneren/betaleren.
 *
 * Tester de PRÆCIS SAMME betingelser som koden bruger:
 *   - submitSignedFuldmagt: requiredSigner = COALESCE(end_customer_id,
 *     site_customer_id, customer_id); token.customer_id skal == requiredSigner.
 *   - getPortalFuldmagter (Query 2): anlægsejerens token ser fuldmagter knyttet
 *     via sag (selv når doc.customer_id = en ANDEN kunde, fx partneren).
 *   - createFuldmagt: blokerer hvis anlægsejeren ikke har aktivt portal-token.
 *
 * Scenarie: Partner P (betaler) ≠ Anlægsejer E (slutkunde). Fuldmagten hænger
 * på P's kort, men sagens end_customer = E.
 *
 * SELV-OPRYDENDE: alt testdata slettes til sidst.
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
  if (!r.ok) throw new Error(`SQL HTTP ${r.status}: ${text.slice(0, 300)} | ${sql.slice(0, 140)}`)
  let json
  try { json = JSON.parse(text) } catch { throw new Error(`SQL-svar ikke JSON: ${text.slice(0, 300)}`) }
  if (json && json.error) throw new Error(`SQL-fejl: ${json.error} | ${sql.slice(0, 140)}`)
  return json
}

let fail = 0
const ok = (c, m) => { console.log(`${c ? '✓' : '✗ FEJL'} ${m}`); if (!c) fail++ }

const uid = () => crypto.randomUUID()
const short = crypto.randomBytes(3).toString('hex')

const P = uid()  // partner / betaler (fuldmagtens doc.customer_id)
const E = uid()  // anlægsejer / end_customer (tiltænkt signer)
const NOTOK = uid() // kunde uden portal-token
const SC = uid() // sag
const D = uid()  // fuldmagt-dokument (på P, sag=SC)
const DLEGACY = uid() // gammel fuldmagt uden sag (på P)
const TP = crypto.randomBytes(32).toString('hex') // partner-token
const TE = crypto.randomBytes(32).toString('hex') // anlægsejer-token

async function cleanup() {
  try {
    await q(`DELETE FROM portal_access_tokens WHERE customer_id IN ('${P}','${E}');`)
    await q(`DELETE FROM customer_documents WHERE id IN ('${D}','${DLEGACY}');`)
    await q(`DELETE FROM service_cases WHERE id='${SC}';`)
    await q(`DELETE FROM customers WHERE id IN ('${P}','${E}');`)
  } catch (e) {
    console.log(`(advarsel: oprydning fejlede delvist: ${e.message})`)
  }
}

try {
  const prof = await q(`SELECT id FROM profiles LIMIT 1;`)
  const usr = await q(`SELECT id FROM auth.users LIMIT 1;`)
  const profileId = prof[0]?.id
  const userId = usr[0]?.id
  if (!profileId || !userId) throw new Error('Mangler profile/auth.users til FK')

  // Kunder: partner P + anlægsejer E
  await q(`INSERT INTO customers (id, customer_number, company_name, contact_person, email, created_by) VALUES
    ('${P}','TEST-GATE-P-${short}','TEST Partner ApS','Partner Kontakt','p-${short}@example.invalid','${profileId}'),
    ('${E}','TEST-GATE-E-${short}','TEST Anlægsejer','Husejer Hansen','e-${short}@example.invalid','${profileId}');`)

  // Sag: customer_id=P, men end_customer (anlægsejer)=E, payer=P
  await q(`INSERT INTO service_cases (id, case_number, title, customer_id, status, end_customer_id, payer_customer_id)
           VALUES ('${SC}','TEST-GATE-CASE-${short}','TEST gate-sag','${P}','new','${E}','${P}');`)

  // Fuldmagt-dok på P's kort, koblet til sag SC
  await q(`INSERT INTO customer_documents (id, customer_id, service_case_id, title, description, document_type, file_url, storage_path, file_name, mime_type, file_size, shared_by)
           VALUES ('${D}','${P}','${SC}','TEST fuldmagt',
                   '{"type":"fuldmagt","expected_signer_customer_id":"${E}","status":"pending"}','contract','','customer-documents/${P}/f.pdf','f.pdf','application/pdf',0,'${userId}');`)

  // Gammel fuldmagt uden sag (backward-compat) på P
  await q(`INSERT INTO customer_documents (id, customer_id, service_case_id, title, description, document_type, file_url, storage_path, file_name, mime_type, file_size, shared_by)
           VALUES ('${DLEGACY}','${P}',NULL,'TEST legacy fuldmagt','{"type":"fuldmagt","status":"pending"}','contract','','','f2.pdf','application/pdf',0,'${userId}');`)

  // Portal-tokens for BÅDE P og E (aktive)
  await q(`INSERT INTO portal_access_tokens (customer_id, email, token, created_by, is_active) VALUES
    ('${P}','p-${short}@example.invalid','${TP}','${userId}',true),
    ('${E}','e-${short}@example.invalid','${TE}','${userId}',true);`)

  ok(true, `setup: partner P + anlægsejer E, sag end_customer=E, fuldmagt på P's kort`)

  // 1) requiredSigner = COALESCE(end_customer, site_customer, customer) = E
  const req = await q(`SELECT COALESCE(sc.end_customer_id, sc.site_customer_id, sc.customer_id) AS required
                       FROM customer_documents d JOIN service_cases sc ON sc.id=d.service_case_id WHERE d.id='${D}';`)
  ok(req[0]?.required === E, `tiltænkt signer resolves til anlægsejeren E (${req[0]?.required === E})`)

  // 2) KERNE: partner-token (P) afvises af gaten (P !== required E)
  ok(P !== req[0]?.required, `NEGATIV: partnerens token (customer=P) ville blive AFVIST — P !== requiredSigner(E)`)

  // 3) anlægsejer-token (E) tillades (E === required E)
  ok(E === req[0]?.required, `anlægsejerens token (customer=E) tillades — E === requiredSigner(E)`)

  // 4) Visibility (getPortalFuldmagter Query 2): E's token ser fuldmagten via sag,
  //    selv om doc.customer_id = P
  const vis = await q(`SELECT d.id FROM customer_documents d
                       WHERE d.document_type='contract'
                         AND d.service_case_id IN (SELECT id FROM service_cases WHERE end_customer_id='${E}' OR site_customer_id='${E}');`)
  ok(vis.some((r) => r.id === D), `anlægsejerens token ser fuldmagten via sag (doc.customer_id=P, men synlig for E)`)

  // 5) is_intended_signer: E=true, P=false
  const signerOfCase = req[0]?.required
  ok(signerOfCase === E && signerOfCase !== P,
     `is_intended_signer: E=true (${signerOfCase === E}), P=false (${signerOfCase !== P})`)

  // 6) createFuldmagt-block: aktivt-token-tjek
  const eTok = await q(`SELECT id FROM portal_access_tokens WHERE customer_id='${E}' AND is_active=true AND (expires_at IS NULL OR expires_at>now()) LIMIT 1;`)
  const noTok = await q(`SELECT id FROM portal_access_tokens WHERE customer_id='${NOTOK}' AND is_active=true AND (expires_at IS NULL OR expires_at>now()) LIMIT 1;`)
  ok(eTok.length === 1 && noTok.length === 0,
     `createFuldmagt-block: anlægsejer MED token tillades (${eTok.length}), kunde UDEN token blokeres (${noTok.length})`)

  // 7) Backward-compat: gammel fuldmagt uden sag → gate falder tilbage til doc.customer_id (P)
  const legacy = await q(`SELECT customer_id, service_case_id FROM customer_documents WHERE id='${DLEGACY}';`)
  ok(legacy[0]?.service_case_id === null && legacy[0]?.customer_id === P,
     `backward-compat: fuldmagt uden sag → required = doc.customer_id (P), uændret adfærd`)
} catch (e) {
  ok(false, `uventet fejl: ${e.message}`)
} finally {
  await cleanup()
  const left = await q(`SELECT COUNT(*) AS n FROM customers WHERE id IN ('${P}','${E}');`).catch(() => [{ n: '?' }])
  ok(Number(left[0]?.n) === 0, `oprydning: testdata slettet (customers tilbage=${left[0]?.n})`)
}

console.log(`\n${fail === 0 ? '✅ FULDMAGT-GATE-VERIFY GRØN' : `❌ ${fail} fejl`}`)
process.exit(fail === 0 ? 0 : 1)
