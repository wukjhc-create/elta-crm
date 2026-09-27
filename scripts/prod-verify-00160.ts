/**
 * PRODUCTION read-only verifikation af migration 00160: ALLE policies (alle kommandoer) paa de 8 tabeller skal vaere
 * praecis det forventede saet, og ingen policy maa have USING/WITH CHECK = true udover de dokumenterede rest-risici.
 *   npm run prod:verify-00160
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const TABLES = ['invoices', 'invoice_payments', 'bank_transactions', 'incoming_invoices', 'supplier_credentials',
  'accounting_integration_settings', 'integration_settings', 'time_logs']

/** tabel -> "policynavn|kommando" forventet efter 00160 (supplier_credentials' SELECT-policy er uaendret, R3). */
const EXPECTED: Record<string, string[]> = {
  invoices: ['invoices_select_by_role|SELECT'],
  invoice_payments: ['invoice_payments_select_by_role|SELECT'],
  bank_transactions: ['bank_transactions_select_by_role|SELECT'],
  incoming_invoices: ['incoming_invoices_delete_admin|DELETE', 'incoming_invoices_insert_admin|INSERT', 'incoming_invoices_select_by_role|SELECT', 'incoming_invoices_update_by_role|UPDATE'],
  supplier_credentials: ['Authenticated users can view supplier credentials|SELECT', 'supplier_credentials_delete_admin|DELETE', 'supplier_credentials_update_admin|UPDATE', 'supplier_credentials_write_admin|INSERT'],
  accounting_integration_settings: ['accounting_integration_settings_select_by_role|SELECT'],
  integration_settings: ['integration_settings_select_admin|SELECT'],
  time_logs: ['time_logs_insert_by_role|INSERT', 'time_logs_select_auth|SELECT', 'time_logs_update_by_role|UPDATE'],
}
/** Policies der BEVIDST stadig har USING (true) (kun SELECT; R2/R3). */
const ALLOWED_TRUE = new Set(['time_logs_select_auth', 'Authenticated users can view supplier credentials'])

withProdReadOnly('prod-verify-00160', async (run, masked) => {
  const rows = await run(`SELECT tablename, policyname, cmd, roles::text AS roles, coalesce(qual, '') AS qual, coalesce(with_check, '') AS with_check
    FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${TABLES.map((t) => `'${t}'`).join(',')}) ORDER BY tablename, policyname`)
  const problems: string[] = []
  for (const t of TABLES) {
    const actual = rows.filter((r: any) => r.tablename === t).map((r: any) => `${r.policyname}|${r.cmd}`).sort()
    const exp = [...EXPECTED[t]].sort()
    if (JSON.stringify(actual) !== JSON.stringify(exp)) problems.push(`${t}: forventet [${exp.join(', ')}] fandt [${actual.join(', ')}]`)
  }
  for (const r of rows as any[]) {
    const openQual = r.qual.trim() === 'true' && !ALLOWED_TRUE.has(r.policyname)
    const openCheck = r.with_check.trim() === 'true'
    if (openQual || openCheck) problems.push(`${r.tablename}.${r.policyname} (${r.cmd}) har ${openQual ? 'USING' : 'WITH CHECK'} = true`)
    if (!/authenticated/.test(r.roles)) problems.push(`${r.tablename}.${r.policyname} gaelder roller ${r.roles}`)
  }
  console.log(`--- 00160 @ prod:${masked} --- ${rows.length} policies paa ${TABLES.length} tabeller`)
  for (const r of rows as any[]) console.log(`  ${r.tablename.padEnd(32)} ${r.cmd.padEnd(6)} ${r.policyname}`)
  console.log(problems.length ? `❌ ${problems.join('\n❌ ')}` : '✅ praecis det forventede policy-saet; ingen skrive-policy med true; ingen utilsigtet USING(true)')
  process.exitCode = problems.length ? 2 : 0
}).catch((e) => { console.error('[prod-verify-00160] FEJL:', maskDbError(e)); process.exit(1) })
