/**
 * N60: kundeimport fra CSV (ren logik, ingen I/O). Typisk eksport fra e-conomic/regneark ved go-live.
 * - Separator gættes (; , eller tab), anførselstegn og "" understøttes, BOM fjernes.
 * - Danske/engelske overskrifter mappes til kundefelter (se HEADER_ALIASES).
 * - Hver række normaliseres og valideres (firmanavn + gyldig e-mail kræves, som i opret-kunde-formularen;
 *   mangler kontaktperson bruges firmanavnet).
 * - Dubletter: mod eksisterende kunder (e-mail, CVR, telefon) og internt i filen.
 */

export type CustomerField =
  | 'company_name' | 'contact_person' | 'email' | 'phone' | 'mobile' | 'vat_number'
  | 'billing_address' | 'billing_postal_code' | 'billing_city' | 'external_number' | 'notes'

const HEADER_ALIASES: Record<CustomerField, string[]> = {
  company_name: ['firmanavn', 'firma', 'navn', 'kundenavn', 'kunde', 'company', 'company name', 'name'],
  contact_person: ['kontaktperson', 'kontakt', 'att', 'attention', 'contact', 'contact person'],
  email: ['email', 'e-mail', 'mail', 'e-mailadresse', 'emailadresse'],
  phone: ['telefon', 'tlf', 'tlf.', 'telefonnummer', 'phone', 'telephone'],
  mobile: ['mobil', 'mobilnummer', 'mobile', 'mobiltelefon'],
  vat_number: ['cvr', 'cvr-nr', 'cvr nr', 'cvr-nummer', 'cvrnr', 'vat', 'vat number', 'momsnummer', 'se-nr'],
  billing_address: ['adresse', 'address', 'vejnavn', 'gade'],
  billing_postal_code: ['postnr', 'post nr', 'postnr.', 'postnummer', 'zip', 'postal code'],
  billing_city: ['by', 'bynavn', 'city', 'town'],
  external_number: ['kundenr', 'kundenr.', 'kundenummer', 'debitornr', 'debitornummer', 'customer number'],
  notes: ['note', 'noter', 'bemærkning', 'bemærkninger', 'notes'],
}

export interface ParsedCustomerRow {
  line: number
  values: Partial<Record<CustomerField, string>>
  error: string | null
}

export interface ParsedCsv {
  delimiter: string
  mapped: Partial<Record<CustomerField, string>> // felt → original overskrift
  unmapped: string[]
  rows: ParsedCustomerRow[]
  /** antal datarækker ud over maxRows (de er IKKE med i rows) — kalderen skal afvise eller sige det (kode-review) */
  truncatedRows: number
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export function guessDelimiter(firstLine: string): string {
  const counts = [';', ',', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0].n > 0 ? counts[0].d : ';'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const phoneDigits = (s: string | undefined | null) => (s ?? '').replace(/\D/g, '').replace(/^45(?=\d{8}$)/, '')

export function parseCustomerCsv(input: string, maxRows = 2000): ParsedCsv {
  const text = input.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = guessDelimiter(firstLine)
  const table = splitCsv(text, delimiter)
  const header = (table[0] ?? []).map((h) => norm(h))
  const mapped: Partial<Record<CustomerField, string>> = {}
  const colField: Array<CustomerField | null> = header.map((h) => {
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[CustomerField, string[]]>) {
      if (!mapped[field] && aliases.includes(h)) { mapped[field] = (table[0] ?? [])[header.indexOf(h)]?.trim() ?? h; return field }
    }
    return null
  })
  const unmapped = header.map((h, i) => (colField[i] ? '' : ((table[0] ?? [])[i]?.trim() || h))).filter(Boolean)
  const rows: ParsedCustomerRow[] = table.slice(1, maxRows + 1).map((cells, idx) => {
    const values: Partial<Record<CustomerField, string>> = {}
    cells.forEach((c, i) => { const f = colField[i]; if (f && c.trim()) values[f] = c.trim() })
    if (!values.contact_person && values.company_name) values.contact_person = values.company_name
    if (values.email) values.email = values.email.toLowerCase()
    if (values.vat_number) values.vat_number = values.vat_number.replace(/^DK\s*/i, '').replace(/\s/g, '')
    let error: string | null = null
    if (!values.company_name) error = 'Firmanavn mangler'
    else if (!values.email) error = 'E-mail mangler'
    else if (!EMAIL_RE.test(values.email)) error = 'Ugyldig e-mail'
    else if (values.company_name.length > 200) error = 'Firmanavn er for langt'
    return { line: idx + 2, values, error }
  })
  const dataRows = table.slice(1).filter((cells) => cells.some((c) => c.trim())).length
  return { delimiter, mapped, unmapped, rows, truncatedRows: Math.max(0, dataRows - rows.length) }
}

export type ImportRowStatus = 'new' | 'duplicate' | 'invalid'
export interface ClassifiedRow extends ParsedCustomerRow { status: ImportRowStatus; reason: string | null }

/** Klassificér rækker mod eksisterende kunder og mod tidligere rækker i samme fil. */
export function classifyCustomerRows(
  rows: ParsedCustomerRow[],
  existing: { emails: Set<string>; vats: Set<string>; phones: Set<string> },
): ClassifiedRow[] {
  const seenEmail = new Set<string>(), seenVat = new Set<string>(), seenPhone = new Set<string>()
  return rows.map((r) => {
    if (r.error) return { ...r, status: 'invalid', reason: r.error }
    const email = r.values.email ?? ''
    const vat = r.values.vat_number ?? ''
    const phone = phoneDigits(r.values.phone || r.values.mobile)
    let reason: string | null = null
    if (existing.emails.has(email)) reason = 'Kunde med samme e-mail findes'
    else if (vat && existing.vats.has(vat)) reason = 'Kunde med samme CVR findes'
    else if (phone.length >= 8 && existing.phones.has(phone)) reason = 'Kunde med samme telefon findes'
    else if (seenEmail.has(email)) reason = 'Samme e-mail tidligere i filen'
    else if (vat && seenVat.has(vat)) reason = 'Samme CVR tidligere i filen'
    else if (phone.length >= 8 && seenPhone.has(phone)) reason = 'Samme telefon tidligere i filen'
    seenEmail.add(email)
    if (vat) seenVat.add(vat)
    if (phone.length >= 8) seenPhone.add(phone)
    return { ...r, status: reason ? 'duplicate' : 'new', reason }
  })
}
