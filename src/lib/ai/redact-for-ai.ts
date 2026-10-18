/**
 * AI-4 (AI-review 2026-10-18): personnumre og bank-/kortnumre maskeres, før mailtekst sendes til en ekstern AI-udbyder.
 * Kunder svarer fx med CPR i fuldmagtssager — resten af systemet maskerer CPR (ST-1, ES-11, ML-2), men AI-promptene
 * fik hele teksten. Ren funktion (ingen I/O); telefonnumre (8 cifre) og postnumre røres ikke.
 */

/** CPR: 6 cifre (ddmmåå) + valgfri bindestreg/mellemrum + 4 cifre */
const CPR_RE = /\b(\d{2})(\d{2})(\d{2})[-\s]?\d{4}\b/g
/** Kortnummer: 13–19 cifre, evt. grupperet med mellemrum/bindestreg */
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g
/** Reg.nr. + kontonr.: 4 cifre + skilletegn + 6–10 cifre (fx "1234 1234567890" eller "1234-0001234567") */
const ACCOUNT_RE = /\b\d{4}[ -]\d{6,10}\b/g
/** IBAN */
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g

export function redactForAi(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(IBAN_RE, '[IBAN]')
    .replace(CPR_RE, (m, dd: string, mm: string) => {
      const d = Number(dd), mo = Number(mm)
      // kun når de første 4 cifre ligner en dato (ellers fx et ordrenummer, der bevares)
      return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 ? '[CPR]' : m
    })
    .replace(ACCOUNT_RE, '[KONTONR]') // før kortreglen: reg.nr. + kontonr. har også 13–14 cifre
    .replace(CARD_RE, (m) => (m.replace(/\D/g, '').length >= 13 ? '[KORTNR]' : m))
}
