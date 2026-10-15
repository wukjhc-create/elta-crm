/** Kundens kontakt ombrydes, og knapperne har et navn. Pladsholder-mailen bliver. Koer: npx tsx scripts/customer-contact-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/customers/[id]/customer-detail-client.tsx', 'utf8')
const contact = src.slice(src.indexOf('Kontaktoplysninger'), src.indexOf('Adresser'))
const people = src.slice(src.indexOf('Kontaktpersoner'), src.indexOf('Email Timeline'))

eq('firma ombrydes', contact.includes('break-words">{customer.company_name}'), true)
eq('mail ombrydes', contact.includes('hover:underline break-all'), true)
eq('telefon ombrydes', contact.includes('tel:${customer.phone}') && contact.slice(contact.indexOf('tel:${customer.phone}'), contact.indexOf('tel:${customer.phone}') + 160).includes('break-all'), true)
eq('pladsholder bliver', contact.includes('data-testid="customer-email-missing"') && contact.includes("@elta-crm.local"), true)
eq('pladsholder er ikke et mailto', contact.indexOf('customer-email-missing') < contact.indexOf('mailto:${customer.email}'), true)
eq('deaktiver har et navn', src.includes("aria-label={customer.is_active ? 'Deaktiver' : 'Aktiver'}"), true)
eq('rediger kunde har et navn', src.includes('aria-label="Rediger kunde"'), true)
eq('slet kunde bliver', src.includes('aria-label="Slet kunde"'), true)
eq('kontakt kan redigeres med navn', people.includes('aria-label={`Rediger ${contact.name}`}'), true)
eq('kontakt kan slettes med navn', people.includes('aria-label={`Slet ${contact.name}`}'), true)
eq('slet bekraeftes', src.includes("title: 'Slet kontakt'"), true)
eq('tom liste siger naeste skridt', people.includes('Tilføj en ovenfor.'), true)
eq('adresse ombrydes', src.includes('className="break-words">{line}'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-contact-wrap-test OK')
process.exitCode = fail ? 1 : 0
