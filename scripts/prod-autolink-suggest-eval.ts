/**
 * PRODUCTION read-only: evaluering af MAIL_AUTOLINK_MODE=suggest (Henrik 2026-10-30). Kun antal og procenter — ingen
 * mails, emner, adresser eller id'er. Sammenligner hvert skygge-forslag (audit_logs, metadata.mode='suggest') med mailens
 * FAKTISKE kobling i dag (manuel / gammel linker / email-intelligence):
 *   enig      = mailen er koblet til forslagets (eneste) kandidat
 *   uenig     = mailen er koblet til en anden kunde
 *   åben      = mailen er stadig ikke koblet
 * Beslutningsgrundlag for 'link': høj-sikkerhed-forslag skal være (næsten) altid enige og aldrig uenige.
 *   npx tsx scripts/prod-autolink-suggest-eval.ts [dage=7]
 */
import { withProdReadOnly } from './prod-readonly'

const days = Math.max(1, Math.min(90, Number(process.argv[2]) || 7))

withProdReadOnly('prod-autolink-suggest-eval', async (run) => {
  const rows = (await run(`SELECT a.metadata->>'confidence' AS confidence,
      (a.metadata->>'would_auto_link')::boolean AS would_link,
      jsonb_array_length(coalesce(a.metadata->'candidate_customer_ids', '[]'::jsonb)) AS n_cand,
      CASE WHEN e.id IS NULL THEN 'mail slettet'
           WHEN e.customer_id IS NULL THEN 'åben'
           WHEN a.metadata->'candidate_customer_ids' ? e.customer_id::text THEN
             CASE WHEN jsonb_array_length(a.metadata->'candidate_customer_ids') = 1 THEN 'enig' ELSE 'blandt kandidater' END
           ELSE 'uenig' END AS outcome,
      coalesce(e.linked_by, '—') AS linked_by
    FROM public.audit_logs a
    LEFT JOIN public.incoming_emails e ON e.id = a.entity_id
    WHERE a.entity_type = 'incoming_email' AND a.action = 'email_link_suggested'
      AND a.metadata->>'mode' = 'suggest' AND a.created_at > now() - interval '${days} days'`)) as Array<Record<string, unknown>>
  console.log(`--- MAIL_AUTOLINK suggest-evaluering, sidste ${days} dage: ${rows.length} forslag ---`)
  if (!rows.length) {
    console.log('Ingen skygge-forslag i perioden (tilstanden er off, eller ingen nye mails matchede).')
    return
  }
  const groups = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const k = `${r.confidence}${r.would_link ? ' (ville koble)' : ''}`
    const g = groups.get(k) ?? new Map<string, number>()
    g.set(String(r.outcome), (g.get(String(r.outcome)) ?? 0) + 1)
    groups.set(k, g)
  }
  const table = [...groups].map(([k, g]) => {
    const n = [...g.values()].reduce((a, b) => a + b, 0)
    const decided = (g.get('enig') ?? 0) + (g.get('uenig') ?? 0)
    return {
      sikkerhed: k, forslag: n, enig: g.get('enig') ?? 0, uenig: g.get('uenig') ?? 0, 'blandt kandidater': g.get('blandt kandidater') ?? 0,
      åben: g.get('åben') ?? 0, præcision: decided ? `${Math.round((100 * (g.get('enig') ?? 0)) / decided)} %` : '—',
    }
  })
  console.table(table)
  const highWrong = rows.filter((r) => r.would_link && r.outcome === 'uenig').length
  console.log(highWrong
    ? `⚠ ${highWrong} høj-sikkerhed-forslag pegede på en ANDEN kunde end den faktiske kobling — 'link' bør ikke godkendes før de er gennemgået`
    : '✓ ingen høj-sikkerhed-forslag var uenige med den faktiske kobling')
})
