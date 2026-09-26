/**
 * PRODUCTION storage-audit — STRENGT READ-ONLY.
 *   npm run prod:storage-audit
 *
 * Sikkerhed (alle lag skal holde, ellers afbrydes FOER foerste forespoergsel):
 *   1. Session startes med default_transaction_read_only=on (startup-option + SET).
 *   2. Al laesning sker i BEGIN READ ONLY; transaction_read_only verificeres = on.
 *   3. Kun faste SELECT-forespoergsler fra storage-audit.ts (ingen input, ingen DDL).
 *   4. Transaktionen afsluttes altid med ROLLBACK.
 * Forbindelse: prodDbUrl fra harness.secrets.local.json (gitignored). Printer aldrig
 * URL, bruger eller password — kun maskeret projekt-ref. Snapshot gemmes i
 * harness-reports/ (gitignored). Exit 2 hvis et sikkerhedshul findes.
 */
import { Client } from 'pg'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { KNOWN_PRODUCTION_REFS, HARNESS_SECRETS_FILE } from './test-harness/env-guard'
import { collectSnapshot, evaluateSnapshot, formatSnapshot } from './test-harness/storage-audit'

function loadProdDbUrl(): string {
  const j = JSON.parse(readFileSync(resolve(process.cwd(), HARNESS_SECRETS_FILE), 'utf8'))
  const url = typeof j.prodDbUrl === 'string' ? j.prodDbUrl.trim() : ''
  if (!url) throw new Error(`prodDbUrl mangler i ${HARNESS_SECRETS_FILE}`)
  return url
}

/** Projekt-ref fra bruger (postgres.<ref>) eller host (db.<ref>.supabase.co). */
function refFromDbUrl(url: string): string | undefined {
  const u = new URL(url)
  return decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]+)$/i)?.[1] ?? u.hostname.match(/^db\.([a-z0-9]+)\./i)?.[1]
}

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  // Vi auditerer bevidst production: afvis alt der IKKE er den kendte prod-ref.
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref — afbryder')
  const masked = `${ref.slice(0, 6)}…`

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    application_name: 'elta-prod-storage-audit-readonly',
    options: '-c default_transaction_read_only=on',
    statement_timeout: 30000,
  })
  await client.connect()
  try {
    await client.query('SET SESSION default_transaction_read_only = on')
    await client.query('BEGIN READ ONLY')
    const ro = (await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only
    if (ro !== 'on') throw new Error('transaktion er ikke read-only — afbryder uden forespoergsler')
    console.log(`[prod-audit] forbundet til prod:${masked} | transaction_read_only=${ro}`)

    const snap = await collectSnapshot(`prod:${masked}`, async (sql) => (await client.query(sql)).rows)
    await client.query('ROLLBACK')

    console.log(formatSnapshot(snap))
    const findings = evaluateSnapshot(snap)
    const holes = findings.filter((x) => x.severity === 'hole')
    for (const x of findings) console.log(`  ${x.severity === 'hole' ? '❌ HUL ' : 'ℹ️ info'} ${x.message}`)

    const dir = resolve(process.cwd(), 'harness-reports')
    mkdirSync(dir, { recursive: true })
    const file = `prod-storage-audit-${snap.at.replace(/[:.]/g, '-')}.json`
    writeFileSync(resolve(dir, file), JSON.stringify({ snapshot: snap, findings }, null, 2))
    console.log(`[prod-audit] snapshot gemt: harness-reports/${file}`)
    console.log(`\n=== PROD STORAGE: ${holes.length ? `❌ ${holes.length} HUL — STOP, ret ikke prod uden godkendelse` : '✅ ingen huller'} (ingen skrivning udfoert) ===`)
    process.exitCode = holes.length ? 2 : 0
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { /* noop */ }
    throw e
  } finally {
    await client.end()
  }
}

// Fejl maskeres: aldrig connection string/credentials i output.
main().catch((e: any) => {
  const msg = String(e?.message ?? e).replace(/postgres(ql)?:\/\/[^\s]+/gi, '<db-url>')
  console.error('[prod-audit] FEJL:', msg)
  process.exit(1)
})
