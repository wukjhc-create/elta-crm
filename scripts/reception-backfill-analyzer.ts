/**
 * Fase 3A — HISTORISK BACKFILL-ANALYSE (READ-ONLY). Importerer intet, skriver intet. Kun antal ud (ingen personværdier).
 *   npx tsx scripts/reception-backfill-analyzer.ts            → production (withProdReadOnly: én READ ONLY-transaktion)
 *   npx tsx scripts/test-harness/cli.ts reception-backfill-analyzer   → staging (samme SQL)
 * Svarer på: hvor mange eksisterende mails/portalbeskeder kunne blive til Henvendelser, hvor mange findes allerede,
 * hvordan er kunde-/sagsmatchet fordelt, og hvor gamle er de — som grundlag for en afgrænset backfill-politik (trin C).
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

/** Én SELECT. Robust uden 00249/00250 (to_regclass). */
export const BACKFILL_ANALYZER_SQL = `SELECT (
WITH mail AS (
  SELECT e.id, e.received_at, e.customer_id, e.linked_by, e.conversation_id AS graph_thread, e.service_case_id,
         (coalesce(e.sender_email, '') ~* '@formsubmit\\.co$' AND coalesce(e.subject, '') ~* 'henvendelse') AS web_form,
         (SELECT count(*) FROM public.customers c WHERE e.customer_id IS NULL AND e.sender_email IS NOT NULL
            AND lower(c.email) = lower(e.sender_email) AND c.email NOT ILIKE '%@elta-crm.local') AS sender_matches
    FROM public.incoming_emails e
   WHERE e.link_status::text <> 'ignored'
     AND coalesce(e.sender_email, '') !~* '@eltasolar\\.dk$'
     AND e.received_at IS NOT NULL
), mail_x AS (
  SELECT m.*,
    CASE WHEN to_regclass('public.conversation_items') IS NULL THEN false
         ELSE EXISTS (SELECT 1 FROM public.conversation_items i WHERE i.source_table = 'incoming_emails' AND i.source_id = m.id) END AS represented,
    (SELECT count(*) FROM public.service_cases s WHERE s.customer_id = m.customer_id AND NOT s.is_proposal AND s.status NOT IN ('closed','converted')) AS open_cases,
    CASE WHEN m.received_at >= now() - interval '7 days' THEN '0_7'
         WHEN m.received_at >= now() - interval '30 days' THEN '8_30'
         WHEN m.received_at >= now() - interval '90 days' THEN '31_90' ELSE 'older' END AS age
  FROM mail m
), portal AS (
  SELECT p.id, p.created_at, p.customer_id, p.offer_id,
    CASE WHEN to_regclass('public.conversation_items') IS NULL THEN false
         ELSE EXISTS (SELECT 1 FROM public.conversation_items i WHERE i.source_table = 'portal_messages' AND i.source_id = p.id) END AS represented,
    (SELECT count(*) FROM public.service_cases s WHERE p.offer_id IS NOT NULL AND s.source_offer_id = p.offer_id AND s.customer_id = p.customer_id AND NOT s.is_proposal) AS offer_cases,
    (SELECT count(*) FROM public.service_cases s WHERE s.customer_id = p.customer_id AND NOT s.is_proposal AND s.status NOT IN ('closed','converted')) AS open_cases,
    CASE WHEN p.created_at >= now() - interval '7 days' THEN '0_7'
         WHEN p.created_at >= now() - interval '30 days' THEN '8_30'
         WHEN p.created_at >= now() - interval '90 days' THEN '31_90' ELSE 'older' END AS age
  FROM public.portal_messages p WHERE p.sender_type = 'customer' AND p.created_at IS NOT NULL
)
SELECT json_build_object(
  'mail', (SELECT json_build_object(
    'eligible', count(*), 'already_represented', count(*) FILTER (WHERE represented),
    'web_forms', count(*) FILTER (WHERE web_form),
    'linked_customer', count(*) FILTER (WHERE customer_id IS NOT NULL),
    'linked_manual', count(*) FILTER (WHERE customer_id IS NOT NULL AND linked_by = 'manual'),
    'linked_auto', count(*) FILTER (WHERE customer_id IS NOT NULL AND linked_by IS DISTINCT FROM 'manual'),
    'unmatched', count(*) FILTER (WHERE customer_id IS NULL),
    'unmatched_unique_sender_candidate', count(*) FILTER (WHERE customer_id IS NULL AND sender_matches = 1),
    'unmatched_ambiguous_sender', count(*) FILTER (WHERE customer_id IS NULL AND sender_matches > 1),
    'unmatched_no_candidate', count(*) FILTER (WHERE customer_id IS NULL AND sender_matches = 0),
    'case_on_mail', count(*) FILTER (WHERE service_case_id IS NOT NULL),
    'possible_open_case_exact', count(*) FILTER (WHERE customer_id IS NOT NULL AND open_cases = 1),
    'possible_open_case_several', count(*) FILTER (WHERE customer_id IS NOT NULL AND open_cases > 1),
    'with_graph_thread', count(*) FILTER (WHERE graph_thread IS NOT NULL AND NOT web_form),
    'distinct_threads', count(DISTINCT graph_thread) FILTER (WHERE graph_thread IS NOT NULL AND NOT web_form),
    'age', json_build_object('0_7', count(*) FILTER (WHERE age = '0_7'), '8_30', count(*) FILTER (WHERE age = '8_30'), '31_90', count(*) FILTER (WHERE age = '31_90'), 'older', count(*) FILTER (WHERE age = 'older')),
    'last_14d', count(*) FILTER (WHERE received_at >= now() - interval '14 days'),
    'last_30d', count(*) FILTER (WHERE received_at >= now() - interval '30 days'),
    'last_30d_linked_or_candidate', count(*) FILTER (WHERE received_at >= now() - interval '30 days' AND (customer_id IS NOT NULL OR sender_matches = 1)),
    'last_30d_active_case_customer', count(*) FILTER (WHERE received_at >= now() - interval '30 days' AND customer_id IS NOT NULL AND open_cases > 0)
  ) FROM mail_x),
  'portal', (SELECT json_build_object(
    'eligible', count(*), 'already_represented', count(*) FILTER (WHERE represented),
    'with_offer', count(*) FILTER (WHERE offer_id IS NOT NULL), 'explicit_case_via_offer', count(*) FILTER (WHERE offer_cases = 1),
    'customer_has_open_case', count(*) FILTER (WHERE open_cases > 0), 'distinct_customers', count(DISTINCT customer_id),
    'age', json_build_object('0_7', count(*) FILTER (WHERE age = '0_7'), '8_30', count(*) FILTER (WHERE age = '8_30'), '31_90', count(*) FILTER (WHERE age = '31_90'), 'older', count(*) FILTER (WHERE age = 'older')),
    'last_30d', count(*) FILTER (WHERE created_at >= now() - interval '30 days')
  ) FROM portal),
  'henvendelser_existing', CASE WHEN to_regclass('public.conversations') IS NULL THEN NULL ELSE (SELECT count(*) FROM public.conversations) END
)) AS r`

if (require.main === module) {
  withProdReadOnly('reception-backfill-analyzer', async (run) => {
    const r = (await run(BACKFILL_ANALYZER_SQL))[0].r
    console.log(JSON.stringify(r, null, 2))
  }).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
}
