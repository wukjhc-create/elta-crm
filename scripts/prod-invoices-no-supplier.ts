/**
 * PRODUCTION read-only: åbne leverandørfakturaer uden leverandør — kunne de være koblet automatisk? Kun antal pr.
 * kategori (ingen navne, CVR eller adresser ud).
 *   npx tsx scripts/prod-invoices-no-supplier.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-invoices-no-supplier', async (run, masked) => {
  const rows = await run(`SELECT
      count(*)::int open_without_supplier,
      count(*) FILTER (WHERE i.source = 'email')::int from_email,
      count(*) FILTER (WHERE i.supplier_vat_number IS NOT NULL AND i.supplier_vat_number <> '')::int has_vat,
      count(*) FILTER (WHERE i.supplier_name_extracted IS NOT NULL AND i.supplier_name_extracted <> '')::int has_name,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM suppliers s WHERE lower(s.name) = lower(trim(i.supplier_name_extracted))))::int name_matches_known_supplier,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM incoming_emails e JOIN suppliers s ON
        lower(split_part(e.sender_email, '@', 2)) <> '' AND (
          lower(coalesce(s.website, '')) LIKE '%' || lower(split_part(e.sender_email, '@', 2)) || '%' OR
          lower(split_part(coalesce(s.contact_email, ''), '@', 2)) = lower(split_part(e.sender_email, '@', 2)))
        WHERE e.id = i.source_email_id))::int sender_domain_matches_known_supplier,
      count(DISTINCT (SELECT lower(split_part(e.sender_email, '@', 2)) FROM incoming_emails e WHERE e.id = i.source_email_id))::int distinct_sender_domains
    FROM incoming_invoices i
    WHERE i.supplier_id IS NULL AND i.status NOT IN ('approved', 'posted', 'rejected', 'cancelled')`)
  console.log(`--- leverandørfakturaer uden leverandør @ prod:${masked} ---`)
  console.table(rows)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
