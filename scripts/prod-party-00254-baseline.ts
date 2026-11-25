/**
 * 00254 parts-/publikumsfundament — PRODUCTION READ-ONLY baseline før/efter præflight (kun SELECT, kun antal/hashes).
 *   npx tsx scripts/prod-party-00254-baseline.ts
 * Skemafingeraftryk (hele public), rettighedskatalog/standarder, kerne-antal, portal-/partnertokens, Stage A-tilstand,
 * nuværende portal-eksponering og partner-dokumenteksponering (F-1), samt eksplicit fravær af alle 00254-objekter.
 * Ingen id'er, navne, mails eller indhold ud.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { STRUCT_MD5 } from './test-harness/reception-00249-probe'

const PARTNER_TYPES = `('quote','invoice','contract','besigtigelse')`
// Dokument der i dag vises i KUNDEportalen (portal.ts-filtrene)
const CUSTOMER_VISIBLE = `d.visible_in_portal AND d.source_email_id IS NULL AND (d.document_type IS NULL OR d.document_type <> 'internal')`
// Dokument der i dag vises i PARTNERportalen (partner-portal.ts-filtrene): sag med betaler = partner med aktivt token
const PARTNER_VISIBLE = `${CUSTOMER_VISIBLE} AND d.document_type IN ${PARTNER_TYPES} AND EXISTS (SELECT 1 FROM public.service_cases s JOIN public.partner_access_tokens t ON t.partner_customer_id = s.payer_customer_id AND t.is_active AND (t.expires_at IS NULL OR t.expires_at > now()) WHERE s.id = d.service_case_id)`

withProdReadOnly('prod-party-00254-baseline', async (run, masked) => {
  const [r] = await run(`SELECT json_build_object(
    'schema_md5', ${STRUCT_MD5},
    'catalog', (SELECT count(*) FROM public.permission_catalog),
    'defaults', (SELECT count(*) FROM public.role_permission_defaults),
    'overrides', (SELECT count(*) FROM public.user_permission_overrides),
    'defaults_by_role', (SELECT json_object_agg(role, n) FROM (SELECT role::text role, count(*) n FROM public.role_permission_defaults GROUP BY 1) x),
    'conversations', (SELECT count(*) FROM public.conversations),
    'customers', (SELECT count(*) FROM public.customers),
    'suppliers', (SELECT count(*) FROM public.suppliers),
    'service_cases', (SELECT count(*) FROM public.service_cases),
    'customer_documents', (SELECT count(*) FROM public.customer_documents),
    'portal_tokens', (SELECT count(*) FROM public.portal_access_tokens),
    'portal_tokens_active', (SELECT count(*) FROM public.portal_access_tokens WHERE is_active AND (expires_at IS NULL OR expires_at > now())),
    'partner_tokens', (SELECT count(*) FROM public.partner_access_tokens),
    'partner_tokens_active', (SELECT count(*) FROM public.partner_access_tokens WHERE is_active AND (expires_at IS NULL OR expires_at > now())),
    'stage_a', json_build_object(
      'conv_by_status', (SELECT json_object_agg(status, n) FROM (SELECT status::text, count(*) n FROM public.conversations GROUP BY 1) x),
      'conv_by_customer_state', (SELECT json_object_agg(s, n) FROM (SELECT customer_match_state::text s, count(*) n FROM public.conversations GROUP BY 1) x),
      'conv_by_case_state', (SELECT json_object_agg(s, n) FROM (SELECT case_match_state::text s, count(*) n FROM public.conversations GROUP BY 1) x),
      'items', (SELECT count(*) FROM public.conversation_items),
      'actions_by_state', (SELECT json_object_agg(s, n) FROM (SELECT state::text s, count(*) n FROM public.conversation_actions GROUP BY 1) x),
      'actions_executed', (SELECT count(*) FROM public.conversation_actions WHERE state::text = 'executed'),
      'lease', (SELECT json_agg(json_build_object('name', name, 'held', expires_at > now())) FROM public.sync_leases)),
    'portal_exposure', json_build_object(
      'customer_portal_docs', (SELECT count(*) FROM public.customer_documents d WHERE ${CUSTOMER_VISIBLE}),
      'customer_portal_docs_mail_attachment', (SELECT count(*) FROM public.customer_documents d WHERE d.visible_in_portal AND d.source_email_id IS NOT NULL),
      'partner_portal_docs', (SELECT count(*) FROM public.customer_documents d WHERE ${PARTNER_VISIBLE}),
      'f1_shared_flag_cross_exposure', (SELECT count(*) FROM public.customer_documents d JOIN public.service_cases s ON s.id = d.service_case_id
          WHERE ${PARTNER_VISIBLE} AND s.payer_customer_id IS DISTINCT FROM d.customer_id),
      'cases_payer_ne_customer', (SELECT count(*) FROM public.service_cases WHERE payer_customer_id IS NOT NULL AND payer_customer_id <> customer_id),
      'portal_tasks_customer_visible', (SELECT count(*) FROM public.customer_tasks WHERE customer_visible)),
    'absent_00254', json_build_object(
      'parties', to_regclass('public.parties') IS NULL,
      'party_relationships', to_regclass('public.party_relationships') IS NULL,
      'case_participants', to_regclass('public.case_participants') IS NULL,
      'external_publications', to_regclass('public.external_publications') IS NULL,
      'conv_source_party_id', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'source_party_id'),
      'conv_communication_class', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'communication_class'),
      'conv_communication_class_source', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'communication_class_source'),
      'key_parties_manage', NOT EXISTS (SELECT 1 FROM public.permission_catalog WHERE permission = 'parties.manage'),
      'key_portal_publish', NOT EXISTS (SELECT 1 FROM public.permission_catalog WHERE permission = 'portal.publish'),
      'functions', NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('publish_external','revoke_external_publication','external_feed','party_can_be_audience','party_visible_to_me','case_visible_to_me','conversations_party_guard','party_relationships_guard','external_publications_guard')),
      'trigger', NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('trg_conversations_party_guard','trg_party_relationships_guard','trg_external_publications_guard')))
  ) j`)
  const j = r.j as Record<string, unknown> & { absent_00254: Record<string, boolean>; portal_exposure: Record<string, number> }
  console.log(`target prod:${masked}`)
  console.log(JSON.stringify(j, null, 1))
  const absent = Object.entries(j.absent_00254)
  for (const [k, v] of absent) console.log(`${v ? 'PASS' : 'FAIL'}  00254-objekt fraværende: ${k}`)
  console.log(`${j.portal_exposure.f1_shared_flag_cross_exposure === 0 ? 'PASS' : 'WARN'}  F-1 krydseksponering (delt visible_in_portal på partnerbetalt sag) = ${j.portal_exposure.f1_shared_flag_cross_exposure}`)
  process.exitCode = absent.every(([, v]) => v) ? 0 : 1
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
