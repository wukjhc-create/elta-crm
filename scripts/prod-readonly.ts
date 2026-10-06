/**
 * Delt PRODUCTION read-only forbindelse til audit/verifikations-scripts.
 *
 * Alle lag skal holde, ellers afbrydes FOER foerste forespoergsel:
 *   1. prodDbUrl skal pege paa den kendte production-ref (vi auditerer bevidst prod, intet andet).
 *   2. Session startes med default_transaction_read_only=on (startup-option + SET SESSION).
 *   3. Al laesning sker i BEGIN READ ONLY; transaction_read_only verificeres = 'on'.
 *   4. Runneren accepterer kun en enkelt SELECT (ingen ';', ingen andre verber).
 *   5. Transaktionen afsluttes altid med ROLLBACK.
 * Credentials printes aldrig; fejl maskeres.
 */
import { Client } from 'pg'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { KNOWN_PRODUCTION_REFS, HARNESS_SECRETS_FILE } from './test-harness/env-guard'

export type ReadOnlyRunner = (sql: string) => Promise<any[]>

function loadProdDbUrl(): string {
  const j = JSON.parse(readFileSync(resolve(process.cwd(), HARNESS_SECRETS_FILE), 'utf8'))
  const url = typeof j.prodDbUrl === 'string' ? j.prodDbUrl.trim() : ''
  if (!url) throw new Error(`prodDbUrl mangler i ${HARNESS_SECRETS_FILE}`)
  return url
}

function refFromDbUrl(url: string): string | undefined {
  const u = new URL(url)
  return decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]+)$/i)?.[1] ?? u.hostname.match(/^db\.([a-z0-9]+)\./i)?.[1]
}

export function maskDbError(e: unknown): string {
  return String((e as { message?: string })?.message ?? e).replace(/postgres(ql)?:\/\/[^\s]+/gi, '<db-url>')
}

/** Svar fra en rolle-probe: rækker eller Postgres-fejlkode (fx 42501 = permission denied). */
export type RoleProbeResult = { ok: true; rows: any[] } | { ok: false; code: string; message: string }
export type RoleProbe = (userId: string, sql: string) => Promise<RoleProbeResult>

/**
 * Som withProdReadOnly, men forespørgsler kan køres SOM en bestemt bruger, præcis som PostgREST gør det:
 * `SET LOCAL ROLE authenticated` + `request.jwt.claims` med brugerens id. Stadig i den samme READ ONLY-transaktion
 * (rulles altid tilbage); hver probe i sin egen SAVEPOINT, så en afvist forespørgsel ikke afbryder resten.
 * Kun enkelt SELECT. Bruges til at verificere RLS/kolonne-rettigheder i prod uden at kende brugernes adgangskoder.
 */
export async function withProdReadOnlyRoleProbe<T>(label: string, fn: (probe: RoleProbe, run: ReadOnlyRunner) => Promise<T>): Promise<T> {
  return withProdReadOnly(label, async (run) => {
    // run er bundet til samme klient/transaktion — vi får klienten via en lille omvej: kør SAVEPOINT-sekvensen med run
    // er ikke muligt (run tillader kun SELECT), så proben bruger en intern klient-reference sat af withProdReadOnly.
    const client = currentClient
    if (!client) throw new Error('intern fejl: ingen klient')
    const probe: RoleProbe = async (userId, sql) => {
      if (!/^\s*SELECT\s/i.test(sql) || sql.includes(';')) throw new Error('kun enkelt SELECT tilladt mod production')
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('ugyldigt bruger-id')
      await client.query('SAVEPOINT role_probe')
      try {
        await client.query('SET LOCAL ROLE authenticated')
        await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
        const rows = (await client.query(sql)).rows
        await client.query('ROLLBACK TO SAVEPOINT role_probe')
        return { ok: true, rows }
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT role_probe')
        const err = e as { code?: string; message?: string }
        return { ok: false, code: err.code ?? '', message: maskDbError(err.message ?? e) }
      }
    }
    return fn(probe, run)
  })
}

let currentClient: Client | null = null

export async function withProdReadOnly<T>(label: string, fn: (run: ReadOnlyRunner, maskedRef: string) => Promise<T>): Promise<T> {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref — afbryder')
  const masked = `${ref.slice(0, 6)}…`
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    application_name: `elta-${label}-readonly`,
    options: '-c default_transaction_read_only=on',
    statement_timeout: 30000,
  })
  await client.connect()
  try {
    await client.query('SET SESSION default_transaction_read_only = on')
    await client.query('BEGIN READ ONLY')
    const ro = (await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only
    if (ro !== 'on') throw new Error('transaktion er ikke read-only — afbryder uden forespoergsler')
    console.log(`[${label}] forbundet til prod:${masked} | transaction_read_only=${ro}`)
    const run: ReadOnlyRunner = async (sql) => {
      if (!/^\s*SELECT\s/i.test(sql) || sql.includes(';')) throw new Error('kun enkelt SELECT tilladt mod production')
      return (await client.query(sql)).rows
    }
    currentClient = client
    const out = await fn(run, masked)
    await client.query('ROLLBACK')
    return out
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { /* noop */ }
    throw e
  } finally {
    currentClient = null
    await client.end()
  }
}
