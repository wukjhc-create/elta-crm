/**
 * PRODUCTION read-only: ses Eltas egne svar (afsender @eltasolar.dk) i incoming_emails? Afgør om "Kræver svar" kan
 * vide at en tråd er besvaret fra Outlook. Kun antal.
 *   npx tsx scripts/prod-mail-outbound.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-mail-outbound', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'mails', (SELECT count(*)::int FROM incoming_emails),
    'fra_eltasolar', (SELECT count(*)::int FROM incoming_emails WHERE sender_email ILIKE '%@eltasolar.dk'),
    'fra_eltasolar_30d', (SELECT count(*)::int FROM incoming_emails WHERE sender_email ILIKE '%@eltasolar.dk' AND received_at > now() - interval '30 days'),
    'med_conversation_id', (SELECT count(*)::int FROM incoming_emails WHERE conversation_id IS NOT NULL),
    'traade_med_svar', (SELECT count(DISTINCT conversation_id)::int FROM incoming_emails WHERE conversation_id IS NOT NULL AND sender_email ILIKE '%@eltasolar.dk'),
    'koblede_kundetraade', (SELECT count(DISTINCT conversation_id)::int FROM incoming_emails WHERE conversation_id IS NOT NULL AND customer_id IS NOT NULL AND link_status = 'linked'),
    'email_messages_udgaaende', (SELECT count(*)::int FROM email_messages),
    'mailbokse', (SELECT json_agg(DISTINCT lower(split_part(to_email, '@', 1))) FROM incoming_emails WHERE to_email ILIKE '%@eltasolar.dk')
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
