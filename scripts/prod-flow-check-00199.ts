/**
 * PRODUCTION flow-tjek for 00199 — ÉN transaktion der ALTID rulles tilbage: opretter en auth-bruger (profil via
 * handle_new_user), en kunde den har oprettet, SLETTER brugeren og kontrollerer at kunden består med created_by NULL.
 * Printer kun tjek — ingen data.   npx tsx scripts/prod-flow-check-00199.ts
 */
import { Client } from 'pg'
import { randomUUID } from 'crypto'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-flow-00199-rollback', statement_timeout: 30000 })
  await client.connect()
  const res: Array<[string, boolean, string]> = []
  try {
    await client.query('BEGIN')
    const uid = randomUUID()
    const stamp = Date.now()
    await client.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)`, [uid, `fc-${stamp}@flow-check.invalid`])
    const prof = (await client.query(`SELECT count(*)::int n FROM profiles WHERE id = $1`, [uid])).rows[0].n
    res.push(['profil oprettet af handle_new_user', prof === 1, String(prof)])
    const cust = (await client.query(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by)
      VALUES ($1, '[FLOW-CHECK] rulles tilbage', 'X', $2, $3) RETURNING id`, [`FC-${stamp}`, `fck-${stamp}@flow-check.invalid`, uid])).rows[0].id as string
    await client.query(`INSERT INTO customer_contacts (customer_id, name) VALUES ($1, 'Kontakt')`, [cust])
    const before = (await client.query(`SELECT count(*)::int n FROM customers`)).rows[0].n as number
    await client.query(`DELETE FROM auth.users WHERE id = $1`, [uid])
    const c = (await client.query(`SELECT created_by FROM customers WHERE id = $1`, [cust])).rows[0]
    res.push(['kunden består efter brugersletning', !!c, ''])
    res.push(['created_by sat til NULL', c?.created_by === null, String(c?.created_by)])
    const contacts = (await client.query(`SELECT count(*)::int n FROM customer_contacts WHERE customer_id = $1`, [cust])).rows[0].n
    res.push(['kundens kontakt består', contacts === 1, String(contacts)])
    const after = (await client.query(`SELECT count(*)::int n FROM customers`)).rows[0].n as number
    res.push(['ingen andre kunder påvirket (antal uændret)', after === before, `${before}→${after}`])
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
  for (const [k, ok, note] of res) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}${note ? ` (${note})` : ''}`)
  const bad = res.filter(([, ok]) => !ok).length
  console.log(bad ? `❌ ${bad} afvigelse(r) — alt rullet tilbage` : `✅ ${res.length} flow-tjek som forventet — alt rullet tilbage`)
  process.exitCode = bad ? 2 : 0
}

main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
