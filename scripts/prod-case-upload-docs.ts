/** PRODUCTION read-only: dokumenter uploadet via sagens Dokumenter-fane (storage_path case-…) — synlige i portalen før D26. Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-case-upload-docs', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'kundedokumenter', (SELECT count(*)::int FROM customer_documents),
    'sagsuploads', (SELECT count(*)::int FROM customer_documents WHERE storage_path LIKE 'customer-documents/%/case-%'),
    'mail_vedhaeftninger', (SELECT count(*)::int FROM customer_documents WHERE source_email_id IS NOT NULL),
    'pr_type', (SELECT json_object_agg(document_type, n) FROM (SELECT document_type, count(*)::int n FROM customer_documents GROUP BY 1) x)
  ) s`))[0].s))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
