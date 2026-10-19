/**
 * Unit-test for LG-13 (2026-10-19): kun egne danske fejltekster vises; rå DB-/netværks-/engelske fejl aldrig.
 *   npx tsx scripts/user-safe-error-test.ts
 */
import { isUserSafeMessage, formatError } from '../src/lib/actions/action-helpers'

let bad = 0
const t = (msg: string, want: boolean) => { const got = isUserSafeMessage(msg); if (got !== want) bad++; console.log(`${got === want ? 'PASS' : 'FAIL'}  ${want ? 'vis ' : 'skjul'}  ${msg}`) }
t('Sagen er lukket', true)
t('Microsoft Graph er ikke konfigureret. Kontakt admin for at aktivere intern mailafsendelse.', true)
t('Du kan kun sende mail på sager/arbejdsordrer, der er tildelt dig', true)
t('duplicate key value violates unique constraint "customers_email_key"', false)
t('new row violates row-level security policy for table "offers"', false)
t('fetch failed', false)
t('TypeError: Cannot read properties of undefined (reading \'id\')', false)
t('Graph API error 403: Forbidden — https://graph.microsoft.com/v1.0/users', false)
t('Kunne ikke hente data: relation "projects" does not exist', false)
t('JWT expired', false)
t('x'.repeat(301) + 'æ', false)
const fe = formatError(new Error('connect ECONNREFUSED 127.0.0.1:5432'), 'Der opstod en fejl')
if (fe !== 'Der opstod en fejl') bad++
console.log(`${fe === 'Der opstod en fejl' ? 'PASS' : 'FAIL'}  formatError skjuler netværksfejl`)
console.log(`\n${bad === 0 ? '✅ ALLE BRUGERFEJLTEKST-TESTS PASS' : `❌ ${bad} FEJL`}`)
process.exit(bad === 0 ? 0 : 1)
