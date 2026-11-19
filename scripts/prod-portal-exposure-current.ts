/**
 * PRODUCTION read-only (portal-sikkerhedsreview 2026-11-18): hvad eksponerer den NUVÆRENDE portalkode?
 * Spejler de præcise filtre/kolonnelister i src/lib/actions/portal.ts + service-cases.ts (getPortalServiceCases).
 * Kun antal — ingen navne, id'er eller indhold ud.
 *   npx tsx scripts/prod-portal-exposure-current.ts
 *
 * 2026-11-19 (efter 00252): opgavesynlighed måles nu som portalen faktisk afgør den — customer_visible = true OG en
 * besigtigelse (booket "Besigtigelse hos …" uden auto_rule, eller kundens egen "PORTAL: Besigtigelse …"). Den gamle
 * titelregel rapporteres kun separat som "gammel_titelregel_*" (historik), aldrig som synlighed.
 * Skelner mellem:
 *  - "data findes i DB" (kost på linjer, interne opgaver hos portalkunder) — det er forventet og internt
 *  - "når kundens browser med nuværende kode" — det der tæller som eksponering
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-portal-exposure-current', async (run) => {
  const PC = `(SELECT DISTINCT customer_id FROM portal_access_tokens WHERE is_active AND (expires_at IS NULL OR expires_at > now()))`
  const PO = `(SELECT o.id, o.customer_id, o.viewed_at FROM offers o WHERE o.status IN ('sent','viewed','accepted','rejected'))`
  const CL = `(SELECT DISTINCT l.offer_id FROM offer_line_items l WHERE coalesce(l.cost_price, 0) > 0 OR l.supplier_cost_price_at_creation IS NOT NULL OR l.margin_percentage IS NOT NULL OR l.supplier_margin_applied IS NOT NULL)`
  const TC = `(SELECT t.customer_id, (t.auto_rule IS NULL AND btrim(t.title) ~* '^besigtigelse hos ') AS booked, (btrim(t.title) ~* '^portal:\s*besigtigelse') AS portal_req, (t.title ILIKE '%esigtigelse%') AS title_match, t.customer_visible AS vis FROM customer_tasks t WHERE t.customer_id IN ${PC})`
  const r = (await run(`SELECT json_build_object(
      'aktive_portalkunder', (SELECT count(*) FROM ${PC} pc),
      'portal_synlige_tilbud', (SELECT count(*) FROM ${PO} po),
      'portal_synlige_tilbud_hos_aktive_portalkunder', (SELECT count(*) FROM ${PO} po WHERE customer_id IN (SELECT customer_id FROM ${PC} pc)),
      'heraf_med_kostdata_i_db', (SELECT count(*) FROM ${PO} p JOIN ${CL} c ON c.offer_id = p.id),
      'heraf_aabnet_i_portal_med_kostdata_i_db', (SELECT count(*) FROM ${PO} p JOIN ${CL} c ON c.offer_id = p.id WHERE p.viewed_at IS NOT NULL),
      'kunder_med_kostdata_paa_portal_tilbud', (SELECT count(DISTINCT p.customer_id) FROM ${PO} p JOIN ${CL} c ON c.offer_id = p.id),
      'opgaver_hos_portalkunder', (SELECT count(*) FROM ${TC} tc),
      'opgaver_kundesynlige_i_alt', (SELECT count(*) FROM ${TC} tc WHERE vis),
      'opgaver_i_portal_nu_booket_besigtigelse', (SELECT count(*) FROM ${TC} tc WHERE vis AND booked),
      'opgaver_i_portal_nu_kundens_egen_anmodning', (SELECT count(*) FROM ${TC} tc WHERE vis AND portal_req AND NOT booked),
      'kundesynlige_men_ikke_besigtigelse_skjult', (SELECT count(*) FROM ${TC} tc WHERE vis AND NOT booked AND NOT portal_req),
      'interne_opgaver_i_alt_skjult', (SELECT count(*) FROM ${TC} tc WHERE NOT (vis AND (booked OR portal_req))),
      'kunder_med_opgaver_i_portal_nu', (SELECT count(DISTINCT customer_id) FROM ${TC} tc WHERE vis AND (booked OR portal_req)),
      'gammel_titelregel_matcher_historik', (SELECT count(*) FROM ${TC} tc WHERE booked OR portal_req),
      'gammel_titelregel_skjult_nu', (SELECT count(*) FROM ${TC} tc WHERE (booked OR portal_req) AND NOT vis),
      'booket_besigtigelse_med_auto_rule', (SELECT count(*) FROM customer_tasks WHERE btrim(title) ~* '^besigtigelse hos ' AND auto_rule IS NOT NULL),
      'dokumenter_i_portal_nu', (SELECT count(*) FROM customer_documents d WHERE d.source_email_id IS NULL AND d.visible_in_portal AND (d.document_type IS NULL OR d.document_type <> 'internal')),
      'dokumenter_i_portal_type_fordeling', (SELECT json_object_agg(coalesce(document_type,'(null)'), n) FROM (SELECT document_type, count(*) n FROM customer_documents d WHERE d.source_email_id IS NULL AND d.visible_in_portal AND (d.document_type IS NULL OR d.document_type <> 'internal') GROUP BY 1) x),
      'dokumenter_i_portal_med_fremmed_sti', (SELECT count(*) FROM customer_documents d WHERE d.source_email_id IS NULL AND d.visible_in_portal AND (d.document_type IS NULL OR d.document_type <> 'internal')
         AND d.storage_path IS NOT NULL AND NOT (d.storage_path LIKE 'customer-documents/' || d.customer_id || '/%' OR d.storage_path LIKE 'outbound-attachments/' || d.customer_id || '/%' OR d.storage_path ~* '^quotes/[0-9]{4}/[^/]+\\.pdf$')),
      'dokumenter_i_portal_uden_sti_med_url', (SELECT count(*) FROM customer_documents d WHERE d.source_email_id IS NULL AND d.visible_in_portal AND (d.document_type IS NULL OR d.document_type <> 'internal') AND d.storage_path IS NULL AND coalesce(d.file_url,'') <> ''),
      'beskeder_i_alt', (SELECT count(*) FROM portal_messages),
      'beskeder_med_tilbud_fra_anden_kunde', (SELECT count(*) FROM portal_messages m JOIN offers o ON o.id = m.offer_id WHERE o.customer_id <> m.customer_id),
      'beskeder_med_vedhaeftning_uden_egen_sti', (SELECT count(*) FROM portal_messages m, jsonb_array_elements(CASE WHEN jsonb_typeof(m.attachments) = 'array' THEN m.attachments ELSE '[]'::jsonb END) a
         WHERE coalesce(a->>'path', a->>'storage_path', '') <> '' AND NOT (coalesce(a->>'path', a->>'storage_path') LIKE m.customer_id || '/%')),
      'sager_i_portal_nu', (SELECT count(*) FROM service_cases WHERE status IN ('new','in_progress','pending') AND customer_id IN (SELECT customer_id FROM ${PC} pc))
    ) j`))[0].j
  console.log(JSON.stringify(r, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
