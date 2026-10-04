/**
 * PRODUCTION read-only: hvor mange åbne webhenvendelser (90 d, uden kunde/lead) er allerede kunder — samme e-mail eller
 * telefon (sidste 8 cifre)? Brødteksten parses LOKALT; KUN antal udskrives.
 *   npx tsx scripts/prod-webform-existing-customers.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { parseCustomerFromEmail } from '../src/lib/utils/email-parser'

const last8 = (s: string | null | undefined) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : '' }

withProdReadOnly('prod-webform-existing-customers', async (run) => {
  const mails = (await run(`SELECT json_agg(json_build_object('t', e.body_text, 'h', e.body_html)) j FROM incoming_emails e
    WHERE e.sender_email ILIKE '%@formsubmit.co' AND e.subject ILIKE '%henvendelse%' AND e.customer_id IS NULL AND NOT e.is_archived
      AND e.received_at > now() - interval '90 days'
      AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.custom_fields->>'source_email_id' = e.id::text)`))[0].j as Array<{ t: string | null; h: string | null }> | null
  const cust = (await run(`SELECT json_agg(json_build_object('e', lower(email), 'p', phone, 'm', mobile, 'auto', 'auto-email' = ANY(tags))) j FROM customers WHERE is_active`))[0].j as Array<{ e: string | null; p: string | null; m: string | null; auto: boolean }>
  const byEmail = new Map<string, boolean>(), byPhone = new Map<string, boolean>()
  for (const c of cust ?? []) { if (c.e) byEmail.set(c.e, c.auto); for (const x of [last8(c.p), last8(c.m)]) if (x) byPhone.set(x, c.auto) }
  let sameEmail = 0, samePhoneOnly = 0, autoCustomer = 0, newPeople = 0
  for (const m of mails ?? []) {
    const p = parseCustomerFromEmail(m.t, m.h, null)
    const e = (p.email ?? '').toLowerCase(), ph = last8(p.phone)
    if (e && byEmail.has(e)) { sameEmail++; if (byEmail.get(e)) autoCustomer++ }
    else if (ph && byPhone.has(ph)) { samePhoneOnly++; if (byPhone.get(ph)) autoCustomer++ }
    else newPeople++
  }
  console.log(JSON.stringify({ aabne_henvendelser: (mails ?? []).length, findes_samme_email: sameEmail, findes_kun_samme_telefon: samePhoneOnly, heraf_auto_kunder: autoCustomer, nye_personer: newPeople }))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
