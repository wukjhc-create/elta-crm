/**
 * PRODUCTION read-only PREVIEW (IC13): hvilke leverandoerfaktura-raekker er i virkeligheden kundens egen mail?
 * Viser praecis de raekker en samlet afvisning ville ramme — ingen navne, e-mails eller tekst (kun id, datoer, status).
 *   npx tsx scripts/prod-preview-customer-mail-invoices.ts
 *
 * Deterministisk regel (samme som isCustomerOwnMail i incoming-invoices.ts):
 *   source='email' · mailen er koblet til en kunde · afsender == kundens e-mail (case-insensitiv, trimmet)
 *   · fakturaen er ulaast (ikke approved/posted/rejected/cancelled) · raekken er broedtekst-faktura (email-<id>.txt)
 * UNDTAGET (ingen gaet): afsender paa eget domaene (eltasolar.dk) — kan vaere en medarbejder der videresender en
 * aegte leverandoerfaktura, selv om adressen staar som e-mail paa en (test)kunde. De vises separat til manuel vurdering.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

export const INTERNAL_DOMAINS = ['eltasolar.dk']

export const PREVIEW_SQL = `SELECT i.id, i.status, i.parse_status, i.created_at::date::text oprettet, e.received_at::date::text modtaget,
    e.has_attachments, (lower(split_part(e.sender_email,'@',2)) IN (${INTERNAL_DOMAINS.map((d) => `'${d}'`).join(',')})) intern_afsender,
    (SELECT count(*) FROM incoming_invoice_lines l WHERE l.incoming_invoice_id = i.id)::int linjer
  FROM incoming_invoices i
  JOIN incoming_emails e ON e.id = i.source_email_id
  JOIN customers c ON c.id = e.customer_id
  WHERE i.source = 'email'
    AND nullif(trim(c.email), '') IS NOT NULL
    AND lower(trim(e.sender_email)) = lower(trim(c.email))
    AND i.status NOT IN ('approved','posted','rejected','cancelled')
    AND i.file_name = 'email-' || i.source_email_id::text || '.txt'
  ORDER BY e.received_at, i.id`

if (require.main === module) {
  withProdReadOnly('prod-preview-customer-mail-invoices', async (run, masked) => {
    console.log(`--- PREVIEW: kundens egne mails i leverandørfaktura-køen @ prod:${masked} ---`)
    const rows = (await run(PREVIEW_SQL)) as Array<Record<string, any>>
    const target = rows.filter((r) => !r.intern_afsender)
    const manual = rows.filter((r) => r.intern_afsender)
    console.log(`  matcher reglen: ${rows.length} · VIL BLIVE AFVIST: ${target.length} · manuel (intern afsender): ${manual.length}`)
    console.log('  status/parse for målrækker:', JSON.stringify(target.reduce((a: Record<string, number>, r) => { const k = `${r.status}/${r.parse_status}`; a[k] = (a[k] ?? 0) + 1; return a }, {})))
    console.log(`  målrækker med fakturalinjer: ${target.filter((r) => r.linjer > 0).length} · med vedhæftning: ${target.filter((r) => r.has_attachments).length}`)
    console.log('  målrækker (id · modtaget · status/parse · linjer):')
    for (const r of target) console.log(`    ${r.id} · ${r.modtaget} · ${r.status}/${r.parse_status} · ${r.linjer}`)
    if (manual.length) {
      console.log('  IKKE omfattet (intern afsender — manuel vurdering):')
      for (const r of manual) console.log(`    ${r.id} · ${r.modtaget} · ${r.status}/${r.parse_status}`)
    }
    const all = (await run(`SELECT count(*)::int n FROM incoming_invoices WHERE source='email' AND status NOT IN ('approved','posted','rejected','cancelled')`))[0].n
    console.log(`  (til sammenligning: ${all} ulåste mail-fakturaer i alt)`)
  }).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
}
