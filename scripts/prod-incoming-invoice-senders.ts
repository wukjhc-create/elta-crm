/**
 * PRODUCTION read-only: leverandørfakturaer fra mail — afsenderdomæner (kun domæne, ingen personadresser) og om et
 * domæne kan kobles til en leverandør via contact_email/website; leverandørernes stamdata-dækning. Kun antal.
 *   npx tsx scripts/prod-incoming-invoice-senders.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-incoming-invoice-senders', async (run) => {
  const row = (await run(`SELECT json_build_object(
      'mail_fakturaer', (SELECT count(*)::int FROM (SELECT lower(split_part(e.sender_email, '@', 2)) dom, i.supplier_name_extracted IS NOT NULL has_name, i.supplier_vat_number IS NOT NULL has_vat FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id WHERE i.source = 'email') s),
      'med_navn_udtrukket', (SELECT count(*)::int FROM (SELECT lower(split_part(e.sender_email, '@', 2)) dom, i.supplier_name_extracted IS NOT NULL has_name, i.supplier_vat_number IS NOT NULL has_vat FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id WHERE i.source = 'email') s WHERE has_name),
      'med_cvr_udtrukket', (SELECT count(*)::int FROM (SELECT lower(split_part(e.sender_email, '@', 2)) dom, i.supplier_name_extracted IS NOT NULL has_name, i.supplier_vat_number IS NOT NULL has_vat FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id WHERE i.source = 'email') s WHERE has_vat),
      'domaener', (SELECT json_agg(json_build_object('d', dom, 'n', n, 'leverandoer_match', m) ORDER BY n DESC) FROM (
          SELECT dom, count(*)::int n,
            (SELECT count(*)::int FROM suppliers su WHERE lower(split_part(su.contact_email, '@', 2)) = s.dom OR lower(su.website) LIKE '%' || s.dom || '%') m
          FROM (SELECT lower(split_part(e.sender_email, '@', 2)) dom, i.supplier_name_extracted IS NOT NULL has_name, i.supplier_vat_number IS NOT NULL has_vat FROM incoming_invoices i JOIN incoming_emails e ON e.id = i.source_email_id WHERE i.source = 'email') s GROUP BY dom) x),
      'leverandoerer', (SELECT count(*)::int FROM suppliers),
      'lev_med_email', (SELECT count(*)::int FROM suppliers WHERE contact_email IS NOT NULL AND contact_email <> ''),
      'lev_med_website', (SELECT count(*)::int FROM suppliers WHERE website IS NOT NULL AND website <> ''),
      'lev_med_cvr', (SELECT count(*)::int FROM suppliers WHERE vat_number IS NOT NULL AND vat_number <> '')
    ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
