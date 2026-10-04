/**
 * PRODUCTION read-only: hvor godt læser parseren de rigtige webhenvendelser (FormSubmit)? Brødteksten parses LOKALT,
 * og der udskrives KUN antal (ingen navne/adresser/numre). Afgør om "Opret lead (for alle)" får e-mail ud af dem.
 *   npx tsx scripts/prod-webform-parse-quality.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
import { parseCustomerFromEmail } from '../src/lib/utils/email-parser'

withProdReadOnly('prod-webform-parse-quality', async (run) => {
  const rows = (await run(`SELECT json_agg(json_build_object('t', body_text, 'h', body_html, 'r', reply_to)) j FROM incoming_emails
    WHERE sender_email ILIKE '%@formsubmit.co' AND subject ILIKE '%henvendelse%'`))[0].j as Array<{ t: string | null; h: string | null; r: string | null }> | null
  const list = rows ?? []
  let email = 0, replyTo = 0, phone = 0, name = 0, address = 0, city = 0, none = 0
  for (const m of list) {
    const p = parseCustomerFromEmail(m.t, m.h, null)
    if (p.email) email++
    else if (m.r && !/formsubmit/i.test(m.r)) replyTo++
    if (p.phone) phone++
    if (p.name) name++
    if (p.address) address++
    if (p.city) city++
    if (!p.email && !p.phone && !p.name) none++
  }
  console.log(JSON.stringify({ henvendelser: list.length, med_email: email, kun_reply_to: replyTo, med_telefon: phone, med_navn: name, med_adresse: address, med_by: city, intet_udtrukket: none }, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
