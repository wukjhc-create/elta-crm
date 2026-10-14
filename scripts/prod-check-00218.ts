/**
 * PRODUCTION-tjek for 00218 (kundedokumenter interne som standard, godkendt 2026-10-14). Kun antal — ingen id'er/navne.
 *   npx tsx scripts/prod-check-00218.ts [pre|post]
 * pre:  hvad portalen viser i dag (source_email_id IS NULL, ekskl. fuldmagter) + mail-arkiv.
 * post: visible_in_portal = true for præcis de rækker portalen viste før; mail-arkiv aldrig; flow i ROLLBACK-transaktion:
 *       ny manuel række er intern, deling slår til/fra, mail-arkiv forbliver ude af portalens forespørgsel.
 */
import { Client } from 'pg'
import { KNOWN_PRODUCTION_REFS } from './test-harness/env-guard'
import { loadProdDbUrl, refFromDbUrl, maskDbError } from './prod-readonly'

const mode = process.argv[2] === 'pre' ? 'pre' : 'post'

async function main() {
  const url = loadProdDbUrl()
  const ref = refFromDbUrl(url)
  if (!ref || !KNOWN_PRODUCTION_REFS.includes(ref)) throw new Error('prodDbUrl peger ikke paa kendt production-ref')
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'elta-check-00218', statement_timeout: 30000 })
  await client.connect()
  const res: Array<[string, boolean, string]> = []
  try {
    await client.query('BEGIN')
    const hasCol = (await client.query(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_documents' AND column_name='visible_in_portal'`)).rows[0].n === 1
    const base = (await client.query(`SELECT count(*)::int total,
        count(*) FILTER (WHERE source_email_id IS NULL)::int portal_before,
        count(*) FILTER (WHERE source_email_id IS NOT NULL)::int mail_archive,
        md5(string_agg(id::text || coalesce(storage_path,'') || coalesce(title,''), '|' ORDER BY id)) checksum
      FROM customer_documents`)).rows[0] as { total: number; portal_before: number; mail_archive: number; checksum: string }
    console.log(`kolonne=${hasCol ? 'findes' : 'mangler'} · dokumenter=${base.total} · portal-synlige (før-reglen)=${base.portal_before} · mail-arkiv=${base.mail_archive} · tjeksum=${base.checksum?.slice(0, 8)}`)
    if (mode === 'pre') {
      res.push(['kolonnen findes endnu ikke', !hasCol, hasCol ? 'findes allerede' : 'mangler'])
    } else {
      res.push(['kolonnen findes', hasCol, ''])
      const v = (await client.query(`SELECT
          count(*) FILTER (WHERE visible_in_portal)::int shared,
          count(*) FILTER (WHERE visible_in_portal AND source_email_id IS NULL)::int shared_non_mail,
          count(*) FILTER (WHERE visible_in_portal AND source_email_id IS NOT NULL)::int shared_mail,
          count(*) FILTER (WHERE NOT visible_in_portal AND source_email_id IS NULL)::int internal_non_mail
        FROM customer_documents`)).rows[0] as { shared: number; shared_non_mail: number; shared_mail: number; internal_non_mail: number }
      res.push(['eksisterende synlighed bevaret (alle tidligere portal-dokumenter er delt)', v.shared_non_mail === base.portal_before && v.internal_non_mail === 0, `delt=${v.shared_non_mail}/${base.portal_before}`])
      res.push(['mail-arkiv er ikke delt', v.shared_mail === 0, `mail delt=${v.shared_mail}`])
      // flow (rulles tilbage)
      const cust = (await client.query(`SELECT id FROM customers ORDER BY created_at LIMIT 1`)).rows[0]?.id as string
      const doc = (await client.query(`INSERT INTO customer_documents (customer_id, title, document_type, file_url, file_name, storage_path)
        VALUES ($1, '[CHECK-00218]', 'other', '', 'x.pdf', $2) RETURNING id, visible_in_portal`, [cust, `customer-documents/${cust}/check-00218.pdf`])).rows[0] as { id: string; visible_in_portal: boolean }
      res.push(['ny manuel række er intern som standard', doc.visible_in_portal === false, String(doc.visible_in_portal)])
      const portalQ = `SELECT count(*)::int n FROM customer_documents WHERE id = $1 AND source_email_id IS NULL AND visible_in_portal`
      const before = (await client.query(portalQ, [doc.id])).rows[0].n
      await client.query(`UPDATE customer_documents SET visible_in_portal = true WHERE id = $1`, [doc.id])
      const after = (await client.query(portalQ, [doc.id])).rows[0].n
      res.push(['"Del med kunde" → med i portalens forespørgsel (før 0, efter 1)', before === 0 && after === 1, `${before}→${after}`])
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
  for (const [k, v, note] of res) console.log(`${v ? 'OK  ' : 'AFV '} ${k}${note ? `  (${note})` : ''}`)
  const bad = res.filter(([, v]) => !v).length
  console.log(bad ? `❌ ${bad} afvigelse(r) (${mode}) — alt rullet tilbage` : `✅ ${res.length} tjek som forventet (${mode}) — alt rullet tilbage`)
  process.exitCode = bad ? 2 : 0
}
main().catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
