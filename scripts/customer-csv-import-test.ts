/**
 * Unit-tests for N60 kundeimport (src/lib/customers/csv-import.ts). Ingen DB.
 *   npx tsx scripts/customer-csv-import-test.ts
 */
import { parseCustomerCsv, classifyCustomerRows, guessDelimiter, phoneDigits } from '../src/lib/customers/csv-import'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }

ok(guessDelimiter('Navn;E-mail;Telefon') === ';' && guessDelimiter('Navn,Email') === ',' && guessDelimiter('a\tb') === '\t', 'separator gættes')
ok(phoneDigits('+45 12 34 56 78') === '12345678' && phoneDigits('4512345678') === '12345678', 'telefon normaliseres (+45 fjernes)')

const csv = '﻿Kundenr;Firmanavn;Kontaktperson;E-mail;Telefon;Adresse;Postnr;By;CVR;Farve\r\n' +
  '1001;"Solgården ApS";Hans Hansen;HANS@solgaarden.dk;+45 11 22 33 44;Vej 1;8000;Aarhus C;DK 12345678;rød\r\n' +
  '1002;"Firma ""Citat"" A/S";;kontakt@citat.dk;;;;;;\r\n' +
  '1003;Uden Mail;;;;;;;;\r\n' +
  '1004;Forkert Mail;;ikke-en-mail;;;;;;\r\n' +
  '1005;Dublet I Fil;;hans@solgaarden.dk;;;;;;\r\n' +
  '1006;Findes Allerede;;eksisterer@kunde.dk;;;;;;\r\n' +
  '1007;Samme CVR;;ny@cvr.dk;;;;;87654321;\r\n' +
  '\r\n'
const p = parseCustomerCsv(csv)
ok(p.delimiter === ';' && p.rows.length === 7, 'BOM, tom linje og CRLF håndteres', `${p.rows.length}`)
ok(p.mapped.company_name === 'Firmanavn' && p.mapped.external_number === 'Kundenr' && p.mapped.vat_number === 'CVR', 'overskrifter mappes', JSON.stringify(p.mapped))
ok(p.unmapped.includes('Farve'), 'ukendte kolonner rapporteres')
const r1 = p.rows[0].values
ok(r1.email === 'hans@solgaarden.dk' && r1.vat_number === '12345678' && r1.billing_postal_code === '8000', 'normalisering (lowercase e-mail, CVR uden DK)')
ok(p.rows[1].values.company_name === 'Firma "Citat" A/S' && p.rows[1].values.contact_person === 'Firma "Citat" A/S', 'anførselstegn + kontaktperson = firmanavn')
ok(p.rows[2].error === 'E-mail mangler' && p.rows[3].error === 'Ugyldig e-mail', 'validering')

const c = classifyCustomerRows(p.rows, { emails: new Set(['eksisterer@kunde.dk']), vats: new Set(['87654321']), phones: new Set() })
ok(c.map((x) => x.status).join(',') === 'new,new,invalid,invalid,duplicate,duplicate,duplicate', 'klassifikation', c.map((x) => `${x.status}:${x.reason ?? ''}`).join(' | '))
ok(c[4].reason === 'Samme e-mail tidligere i filen' && c[5].reason === 'Kunde med samme e-mail findes' && c[6].reason === 'Kunde med samme CVR findes', 'dublet-årsager')

const comma = parseCustomerCsv('Name,Email,Phone\nAcme,info@acme.dk,12345678\n')
ok(comma.delimiter === ',' && comma.rows[0].values.company_name === 'Acme' && comma.rows[0].values.phone === '12345678', 'kommasepareret engelsk')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle kundeimport-tests bestået')
process.exitCode = bad ? 1 : 0
