/**
 * Webhenvendelser fra eltasolar.dk's kontaktformular (FormSubmit). Ren logik, ingen I/O.
 *
 * Fund (prod read-only 2026-10-02): FormSubmit stod på listen over HARD-ignorerede domæner (og "submissions@" på
 * ignore-afsendere) siden 2026-04-30 → ~48 henvendelser fra hjemmesiden ("Ny henvendelse fra eltasolar.dk") blev
 * markeret "ignored" og aldrig set; prod har kun 3 website-leads. FormSubmits egne systemmails ("Activate FormSubmit")
 * er fortsat støj.
 */
const FORMSUBMIT_DOMAIN = /(^|\.)formsubmit\.co$/i
const INQUIRY_SUBJECT = /henvendelse|kontaktformular|new submission|inquiry/i
const SYSTEM_SUBJECT = /activate formsubmit|action required|confirm your email/i

export function isWebsiteInquiry(email: { senderEmail?: string | null; subject?: string | null }): boolean {
  const domain = (email.senderEmail ?? '').toLowerCase().split('@')[1] ?? ''
  if (!FORMSUBMIT_DOMAIN.test(domain)) return false
  const subject = email.subject ?? ''
  return INQUIRY_SUBJECT.test(subject) && !SYSTEM_SUBJECT.test(subject)
}

const FORM_KEYS: Record<string, string> = {
  name: 'Navn', navn: 'Navn', phone: 'Telefon', telefon: 'Telefon', tlf: 'Telefon', email: 'Email', 'e-mail': 'Email',
  address: 'Adresse', adresse: 'Adresse', zip: 'Postnummer', postnummer: 'Postnummer', postnr: 'Postnummer', 'postnr.': 'Postnummer', city: 'By', by: 'By',
  inquiry_type: 'Type', message: 'Besked', besked: 'Besked',
}

/**
 * FormSubmit sender en tabel (Name | Value); strippet til tekst bliver det skiftevis nøgle- og værdilinjer.
 * Omskriv til "Navn: …"-linjer, som den eksisterende mail-parser (labeled fields) forstår. Uændret tekst ellers.
 */
export function normalizeFormSubmitTable(text: string): string {
  if (!/here.?s what they had to say/i.test(text)) return text
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const key = FORM_KEYS[lines[i].toLowerCase()]
    const next = lines[i + 1]
    // Tabelhovedet "Name | Value" er ikke et felt
    if (lines[i].toLowerCase() === 'name' && next?.toLowerCase() === 'value') { i++; continue }
    if (/^name\s+value$/i.test(lines[i])) continue
    if (key && next !== undefined && !FORM_KEYS[next.toLowerCase()]) {
      out.push(`${key}: ${next}`)
      i++
      continue
    }
    // N92: mailens HTML→tekst lægger cellerne på SAMME linje ("name Hans Hansen", </td> → mellemrum) — prod: 28 af 43
    // henvendelser mistede navnet. Nøglen er første ord, værdien resten.
    const same = /^(\S+)\s+(.+)$/.exec(lines[i])
    const sameKey = same ? FORM_KEYS[same[1].toLowerCase()] : undefined
    if (same && sameKey) out.push(`${sameKey}: ${same[2].trim()}`)
  }
  // N92: kun de normaliserede felter — med den rå tabel bagefter "løb" adressen ind i FormSubmits egen tekst
  // ("Solvej 12, Here's what they had to say, Name, Value") i rigtige henvendelser
  return out.length ? out.join('\n') : text
}
