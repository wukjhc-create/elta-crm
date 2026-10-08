/**
 * PRODUCTION smoke-test før aktivering af OFFER_REVISIONS_ENABLED (00203 Trin B) — ÉN transaktion der ALTID rulles
 * tilbage. Kører samme databaseoperationer som lib/offers/revisions.ts mod det rigtige prod-skema:
 *   snapshot ved afsendelse · unik (tilbud, revision) · ny revision med kæde · afløsning (ikke accepteret) ·
 *   underskrift bundet til snapshot · portal-filter (superseded_by IS NULL) · eksisterende tilbud upåvirket.
 * Printer kun tjek. Intet efterlades.   npx tsx scripts/prod-smoke-00203.ts
 */
import { Client } from 'pg'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-smoke-00203-rollback', statement_timeout: 30000 })
  await client.connect()
  const res: Array<[string, boolean, string]> = []
  try {
    await client.query('BEGIN')
    const admin = (await client.query(`SELECT id FROM profiles WHERE is_active AND role = 'admin' ORDER BY created_at LIMIT 1`)).rows[0]?.id as string
    const stamp = Date.now()
    const before = (await client.query(`SELECT count(*)::int n FROM offers WHERE superseded_by IS NULL`)).rows[0].n as number
    const cust = (await client.query(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by) VALUES ($1, '[SMOKE] rulles tilbage', 'X', $2, $3) RETURNING id`,
      [`SM-${stamp}`, `sm-${stamp}@flow-check.invalid`, admin])).rows[0].id as string
    const r1 = (await client.query(`INSERT INTO offers (offer_number, title, created_by, customer_id, status, sent_at) VALUES ($1, '[SMOKE] 00203', $2, $3, 'sent', now()) RETURNING id`,
      [`SM-${stamp}`, admin, cust])).rows[0].id as string
    await client.query(`INSERT INTO offer_line_items (offer_id, position, description, quantity, unit, unit_price, sale_price, total) VALUES ($1, 1, 'Linje', 1, 'stk', 1000, 1000, 1000)`, [r1])
    const s1 = (await client.query(`INSERT INTO offer_snapshots (offer_id, revision_number, snapshot, sent_by) VALUES ($1, 1, '{"lines":[{"unit_price":1000}]}'::jsonb, $2) RETURNING id`, [r1, admin])).rows[0].id as string
    res.push(['snapshot gemmes ved afsendelse (rev 1)', !!s1, ''])
    await client.query('SAVEPOINT dup')
    const dup = await client.query(`INSERT INTO offer_snapshots (offer_id, revision_number, snapshot) VALUES ($1, 1, '{}'::jsonb)`, [r1]).then(() => 'ok', (e: { code?: string }) => e.code ?? 'fejl')
    await client.query('ROLLBACK TO SAVEPOINT dup')
    res.push(['samme revision kan ikke snapshottes to gange (unik)', dup === '23505', String(dup)])
    const r2 = (await client.query(`INSERT INTO offers (offer_number, title, created_by, customer_id, status, revision_of, revision_number) VALUES ($1, '[SMOKE] 00203', $2, $3, 'draft', $4, 2) RETURNING id`,
      [`SM-${stamp}-R2`, admin, cust, r1])).rows[0].id as string
    await client.query(`UPDATE offers SET status = 'sent', sent_at = now() WHERE id = $1`, [r2])
    await client.query(`INSERT INTO offer_snapshots (offer_id, revision_number, snapshot) VALUES ($1, 2, '{"lines":[{"unit_price":1200}]}'::jsonb)`, [r2])
    const sup = await client.query(`UPDATE offers SET superseded_by = $1, superseded_at = now() WHERE id = $2 AND superseded_by IS NULL AND status <> 'accepted' RETURNING id`, [r2, r1])
    res.push(['ny revision sendt → forrige afløst', sup.rowCount === 1, ''])
    const portal = (await client.query(`SELECT id FROM offers WHERE customer_id = $1 AND status IN ('sent','viewed','accepted','rejected') AND superseded_by IS NULL`, [cust])).rows.map((r) => r.id)
    res.push(['portal-filter viser kun gældende revision', portal.length === 1 && portal[0] === r2, String(portal.length)])
    const s2 = (await client.query(`SELECT id FROM offer_snapshots WHERE offer_id = $1 ORDER BY revision_number DESC LIMIT 1`, [r2])).rows[0].id as string
    const sig = await client.query(`INSERT INTO offer_signatures (offer_id, signer_name, signer_email, signature_data, snapshot_id) VALUES ($1, 'Smoke', $2, 'data:image/png;base64,AA', $3) RETURNING snapshot_id`, [r2, `sm-${stamp}@flow-check.invalid`, s2])
    res.push(['underskrift bindes til præcis revision (snapshot_id)', sig.rows[0].snapshot_id === s2, ''])
    const snap1 = (await client.query(`SELECT snapshot FROM offer_snapshots WHERE id = $1`, [s1])).rows[0].snapshot as { lines: Array<{ unit_price: number }> }
    res.push(['R1-snapshot uændret efter revision', snap1.lines[0].unit_price === 1000, ''])
    const after = (await client.query(`SELECT count(*)::int n FROM offers WHERE superseded_by IS NULL AND customer_id <> $1`, [cust])).rows[0].n as number
    res.push(['eksisterende tilbud upåvirket', after === before, `${before}→${after}`])
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r) — alt rullet tilbage` : `✅ ${res.length} smoke-tjek som forventet — alt rullet tilbage`)
  process.exitCode = bad ? 2 : 0
}

main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
