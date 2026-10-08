/** PRODUCTION read-only (kommunikations-review): mail-vedhæftninger i customer_documents synlige i portalen. Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-portal-mail-docs', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'mail_dokumenter', (SELECT count(*)::int FROM customer_documents WHERE source_email_id IS NOT NULL),
    'mail_dokumenter_hos_kunder_med_aktivt_portallink', (SELECT count(*)::int FROM customer_documents d WHERE d.source_email_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM portal_access_tokens t WHERE t.customer_id = d.customer_id AND t.is_active AND (t.expires_at IS NULL OR t.expires_at > now()))),
    'heraf_fra_leverandoermail', (SELECT count(*)::int FROM customer_documents d JOIN incoming_emails e ON e.id = d.source_email_id
      WHERE EXISTS (SELECT 1 FROM portal_access_tokens t WHERE t.customer_id = d.customer_id AND t.is_active AND (t.expires_at IS NULL OR t.expires_at > now()))
      AND lower(split_part(e.sender_email, '@', 2)) <> lower(split_part(coalesce((SELECT c.email FROM customers c WHERE c.id = d.customer_id), ''), '@', 2)))
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
