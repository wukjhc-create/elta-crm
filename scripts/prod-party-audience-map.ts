/**
 * Parts-/publikumsmodel — PRODUCTION READ-ONLY kortlægning (2026-11-23). Kun antal; ingen personværdier ud.
 * Postkasser vises kun som fælles-postkasse-navn (kontakt/ordre/…); personlige adresser maskeres som "personal#n".
 *   npx tsx scripts/prod-party-audience-map.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const SHARED = new Set(['kontakt', 'ordre', 'order', 'info', 'faktura', 'bogholderi', 'service', 'salg', 'support', 'noreply', 'no-reply'])
const label = (addr: string | null, personal: Map<string, string>) => {
  const a = String(addr ?? '').toLowerCase().trim()
  if (!a.includes('@')) return '(tom)'
  const [local, domain] = a.split('@')
  if (domain !== 'eltasolar.dk') return `ekstern@${domain === 'elta-crm.local' ? 'elta-crm.local' : '…'}`
  if (SHARED.has(local)) return `${local}@eltasolar.dk`
  if (!personal.has(a)) personal.set(a, `personal#${personal.size + 1}@eltasolar.dk`)
  return personal.get(a)!
}

withProdReadOnly('prod-party-audience-map', async (run) => {
  const personal = new Map<string, string>()
  const cols = await run(`SELECT table_name t, column_name c FROM information_schema.columns WHERE table_schema = 'public'
    AND ((table_name = 'incoming_emails' AND column_name IN ('mailbox_source','to_email')) OR (table_name = 'suppliers' AND column_name IN ('vat_number','external_supplier_id','external_provider','contact_email','website'))
      OR table_name IN ('parties','party_relationships','case_participants','external_publications'))`)
  console.log(`INFO  kolonner: ${cols.map((r) => `${r.t}.${r.c}`).join(', ')}`)
  const hasMailboxSource = cols.some((r) => r.t === 'incoming_emails' && r.c === 'mailbox_source')
  const sync = await run(`SELECT mailbox, (delta_link IS NOT NULL) has_delta, last_sync_at FROM graph_sync_state`)
  console.log(`INFO  graph_sync_state (synkede postkasser): ${sync.map((r) => `${label(r.mailbox, personal)} delta=${r.has_delta} sidst=${r.last_sync_at ? new Date(r.last_sync_at).toISOString().slice(0, 16) : '-'}`).join(' | ')}`)
  const byBox = await run(`SELECT lower(${hasMailboxSource ? 'coalesce(mailbox_source, to_email)' : 'to_email'}) mb, count(*)::int n, max(received_at) last FROM incoming_emails GROUP BY 1 ORDER BY 2 DESC LIMIT 20`)
  console.log(`INFO  indgående mails pr. postkasse: ${byBox.map((r) => `${label(r.mb, personal)}=${r.n}`).join(', ')}`)
  const [m] = await run(`SELECT json_build_object(
    'customers', (SELECT count(*) FROM customers),
    'customers_auto', (SELECT count(*) FROM customers WHERE 'auto-email' = ANY(tags)),
    'contacts', (SELECT count(*) FROM customer_contacts),
    'contact_roles', (SELECT json_object_agg(coalesce(role,'null'), n) FROM (SELECT role, count(*) n FROM customer_contacts GROUP BY role) x),
    'leads', (SELECT count(*) FROM leads),
    'suppliers', (SELECT count(*) FROM suppliers),
    'suppliers_active', (SELECT count(*) FROM suppliers WHERE is_active),
    'suppliers_email', (SELECT count(contact_email) FROM suppliers),
    'suppliers_vat', (SELECT count(vat_number) FROM suppliers),
    'suppliers_ext', (SELECT count(external_supplier_id) FROM suppliers),
    'employees', (SELECT count(*) FROM employees),
    'profiles', (SELECT count(*) FROM profiles),
    'cases', (SELECT count(*) FROM service_cases),
    'cases_orderer_ne_customer', (SELECT count(*) FROM service_cases WHERE orderer_customer_id IS NOT NULL AND orderer_customer_id <> customer_id),
    'cases_payer_ne_customer', (SELECT count(*) FROM service_cases WHERE payer_customer_id IS NOT NULL AND payer_customer_id <> customer_id),
    'cases_end_ne_customer', (SELECT count(*) FROM service_cases WHERE end_customer_id IS NOT NULL AND end_customer_id <> customer_id),
    'cases_site_customer', (SELECT count(site_customer_id) FROM service_cases),
    'cases_purchased_from', (SELECT count(purchased_from_customer_id) FROM service_cases),
    'offers', (SELECT count(*) FROM offers),
    'work_orders', (SELECT count(*) FROM work_orders),
    'conversations', (SELECT count(*) FROM conversations),
    'conversation_items', (SELECT count(*) FROM conversation_items),
    'portal_messages', (SELECT count(*) FROM portal_messages),
    'portal_messages_by_sender', (SELECT json_object_agg(coalesce(sender_type,'null'), n) FROM (SELECT sender_type, count(*) n FROM portal_messages GROUP BY sender_type) x),
    'portal_tokens_active', (SELECT count(*) FROM portal_access_tokens WHERE is_active),
    'partner_tokens', (SELECT count(*) FROM partner_access_tokens),
    'partner_tokens_active', (SELECT count(*) FROM partner_access_tokens WHERE is_active),
    'partner_customers', (SELECT count(DISTINCT partner_customer_id) FROM partner_access_tokens),
    'docs', (SELECT count(*) FROM customer_documents),
    'docs_visible_in_portal', (SELECT count(*) FROM customer_documents WHERE visible_in_portal),
    'docs_from_mail', (SELECT count(source_email_id) FROM customer_documents),
    'docs_shared_on_payer_case', (SELECT count(*) FROM customer_documents d JOIN service_cases s ON s.id = d.service_case_id
        WHERE d.visible_in_portal AND d.source_email_id IS NULL AND coalesce(d.document_type,'') <> 'internal'
          AND s.payer_customer_id IS NOT NULL AND s.payer_customer_id <> d.customer_id),
    'docs_shared_on_partner_token_case', (SELECT count(*) FROM customer_documents d JOIN service_cases s ON s.id = d.service_case_id
        WHERE d.visible_in_portal AND d.source_email_id IS NULL AND coalesce(d.document_type,'') <> 'internal'
          AND s.payer_customer_id IN (SELECT partner_customer_id FROM partner_access_tokens WHERE is_active)
          AND s.payer_customer_id <> d.customer_id),
    'tasks_customer_visible', (SELECT count(*) FROM customer_tasks WHERE customer_visible),
    'incoming_invoices', (SELECT count(*) FROM incoming_invoices),
    'incoming_invoices_supplier_linked', (SELECT count(supplier_id) FROM incoming_invoices),
    'accounting_provider_rows', (SELECT count(*) FROM accounting_integration_settings),
    'intel_classification', (SELECT json_object_agg(coalesce(classification,'null'), n) FROM (SELECT classification, count(*) n FROM email_intelligence_logs GROUP BY classification) x)
  ) j`)
  for (const [k, v] of Object.entries(m.j as Record<string, unknown>)) console.log(`INFO  ${k}: ${JSON.stringify(v)}`)
  console.log(`INFO  personlige postkasser set: ${personal.size}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
