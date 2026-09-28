/**
 * Telefonnumre til Relatel-integrationen (P3 #15). Rene funktioner.
 *
 * Relatel-format (dev.relatel.dk/oas): landekode + nummer, uden '+' eller '00' — fx '4571999999'.
 * CRM'ets data (prod, 2026-09-28, kun formater talt): customers 65× 8 cifre (evt. med mellemrum), 15× '+45…',
 * 23× tom; kontakter/leads: 8 cifre. Match sker derfor ALTID paa normaliserede numre, aldrig paa raa tekst.
 */

/** Normalisér til Relatel-format. Danske 8-cifrede numre faar '45'. null hvis det ikke er et brugbart nummer. */
export function toRelatelNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  let digits = trimmed.replace(/[^0-9]/g, '')
  if (!digits) return null
  if (trimmed.startsWith('+')) {
    // international form: cifrene er allerede landekode + nummer
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.length === 8) {
    digits = `45${digits}`
  }
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

/** Samme nummer? (begge normaliseres; ubrugelige numre matcher aldrig) */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = toRelatelNumber(a)
  return !!x && x === toRelatelNumber(b)
}

/** Visning: '4571999999' -> '+45 71 99 99 99'; andre lande -> '+<cifre>'. */
export function formatPhoneForDisplay(relatelNumber: string): string {
  if (/^45\d{8}$/.test(relatelNumber)) {
    const n = relatelNumber.slice(2)
    return `+45 ${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${n.slice(6, 8)}`
  }
  return `+${relatelNumber}`
}
