/**
 * PRODUCTION migration-anvendelse — KUN eksplicit godkendte migrationer.
 *   npm run prod:apply-migration -- <nr> --approved-by-henrik
 *
 * Sikkerhed:
 *   - Allowlist: kun migrationer Henrik har godkendt til prod (APPROVED nedenfor, med dato for godkendelsen).
 *   - Kraever flaget --approved-by-henrik (ingen utilsigtet koersel).
 *   - prodDbUrl skal pege paa den kendte production-ref.
 *   - Filen koeres UAENDRET; den er selv én transaktion (BEGIN/COMMIT) - fejler ét trin, rulles alt tilbage.
 *   - Credentials printes aldrig; fejl maskeres.
 * Verifikation foer/efter sker med de read-only scripts (prod:role-policies, prod:verify-00159).
 */
import { Client } from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { KNOWN_PRODUCTION_REFS, HARNESS_SECRETS_FILE } from './test-harness/env-guard'
import { maskDbError } from './prod-readonly'

/** Godkendt til production af Henrik (chat, 2026-09-27): 00160 foerst, derefter 00159. */
const APPROVED: Record<string, string> = {
  '00160': '2026-09-27',
  '00159': '2026-09-27',
  '00161': '2026-09-27', // R1–R4, godkendt af Henrik i chat 2026-09-27
  '00162': '2026-09-28', // P-004 anon-eksponering, godkendt af Henrik i chat 2026-09-28
  '00163': '2026-09-29', // agent capability-guard, godkendt af Henrik i chat 2026-09-29
  '00164': '2026-09-29', // supplier_settings lockdown (P-005), godkendt af Henrik i chat 2026-09-29
  '00165': '2026-09-29', // price_history change_source (ftp_sync), godkendt af Henrik i chat 2026-09-29
  '00166': '2026-09-29', // incoming_invoice_lines + audit RLS (P-007), godkendt af Henrik i chat 2026-09-29
  '00167': '2026-09-30', // suppliers.vat_number (IC10), godkendt af Henrik i chat 2026-09-30
  '00168': '2026-09-30', // suppliers admin-only skrivning (P-008), godkendt af Henrik i chat 2026-09-30
  '00169': '2026-09-30', // DATA: afvis 18 kundemails i leverandoerfaktura-koeen (IC13), godkendt af Henrik i chat 2026-09-30
  '00170': '2026-10-01', // P-009 RLS-skrivelaas runde 1, godkendt af Henrik i chat 2026-10-01
  '00171': '2026-10-01', // P-009 RLS-skrivelaas runde 2A, godkendt af Henrik i chat 2026-10-01
  '00172': '2026-10-01', // P-009 RLS-skrivelaas runde 2B, godkendt af Henrik i chat 2026-10-01
  '00173': '2026-10-01', // P-009 RLS-skrivelaas runde 3A, godkendt af Henrik i chat 2026-10-01
  '00174': '2026-10-01', // P-009 RLS-skrivelaas runde 3B, godkendt af Henrik i chat 2026-10-01
  '00180': '2026-10-03', // G10 montoer-mailscope + serviceleder ser medarbejdere, godkendt af Henrik i chat 2026-10-03 (koeres foerst)
  '00181': '2026-10-03', // P-009 WAVE5 work_orders (montoer kun egne), godkendt af Henrik i chat 2026-10-03
  '00175': '2026-10-03', // P-009 laese-lockdown A1 (tokens, beskeder), godkendt af Henrik i chat 2026-10-03
  '00176': '2026-10-03', // P-009 laese-lockdown A2 (integrationshemmeligheder), godkendt af Henrik i chat 2026-10-03
  '00177': '2026-10-03', // P-009 laese-lockdown A3 (bekraeftelses-tokens, underskrifter), godkendt af Henrik i chat 2026-10-03
  '00179': '2026-10-03', // P-009 laese-lockdown A4 (firma-/e-conomic-hemmeligheder), godkendt af Henrik i chat 2026-10-03
  '00178': '2026-10-03', // P-009 WAVE4 (kalkulations-/katalogtabeller), godkendt af Henrik i chat 2026-10-03
  '00182': '2026-10-03', // D2 audit-identitet, godkendt af Henrik i chat 2026-10-03
  '00183': '2026-10-03', // N4 trigram-indeks (uden for 02:00-sync), godkendt af Henrik i chat 2026-10-03
  '00185': '2026-10-04', // N2 godkendelse af timer (time_logs.approval_status + guard-trigger), godkendt af Henrik i chat 2026-10-04
  '00192': '2026-10-05', // kost-/løndata-lockdown (T1/L1/M1/P2), godkendt af Henrik i chat 2026-10-05 ("00192 Godkendt til PROD")
}

async function main() {
  const num = String(process.argv[2] || '')
  if (!APPROVED[num]) throw new Error(`migration ${num || '(ingen)'} er ikke godkendt til production`)
  if (!process.argv.includes('--approved-by-henrik')) throw new Error('mangler --approved-by-henrik')

  const dir = resolve(process.cwd(), 'supabase', 'migrations')
  const files = readdirSync(dir).filter((f) => f.startsWith(`${num}_`) && f.endsWith('.sql'))
  if (files.length !== 1) throw new Error(`forventede praecis én fil for ${num}, fandt ${files.length}`)
  const sql = readFileSync(resolve(dir, files[0]), 'utf8')
  if (!/^\s*BEGIN;/m.test(sql) || !/^\s*COMMIT;/m.test(sql)) throw new Error('migrationen er ikke én eksplicit transaktion')

  const j = JSON.parse(readFileSync(resolve(process.cwd(), HARNESS_SECRETS_FILE), 'utf8'))
  const url = String(j.prodDbUrl || '').trim()
  const u = new URL(url)
  const ref = decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]+)$/i)?.[1] ?? u.hostname.match(/^db\.([a-z0-9]+)\./i)?.[1]
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: `elta-apply-${num}`, statement_timeout: 60000 })
  await client.connect()
  try {
    console.log(`[prod-apply] ${files[0]} -> prod:${ref.slice(0, 6)}… (godkendt ${APPROVED[num]})`)
    await client.query(sql)
    console.log('[prod-apply] ✅ COMMIT gennemfoert')
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { /* noop */ }
    throw e
  } finally {
    await client.end()
  }
}

main().catch((e) => { console.error('[prod-apply] FEJL (intet aendret hvis fejlen skete i transaktionen):', maskDbError(e)); process.exit(1) })
