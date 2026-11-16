/**
 * Telefonnumre til Relatel-integrationen (P3 #15). Rene funktioner.
 *
 * Relatel-format (dev.relatel.dk/oas): landekode + nummer, uden '+' eller '00' — fx '4571999999'.
 * Normaliseringen ER den kanoniske match-nøgle i lib/utils/phone.ts (samlet i AI-receptionist fase 2) — denne fil
 * re-eksporterer den under de navne telefoni-koden bruger, så der kun findes ÉN implementering.
 */
import { canonicalPhone, samePhone } from '@/lib/utils/phone'

/** Normalisér til Relatel-format (= canonicalPhone). Danske 8-cifrede numre faar '45'. null hvis ubrugeligt. */
export const toRelatelNumber = canonicalPhone
export { samePhone }

/** Visning: '4571999999' -> '+45 71 99 99 99'; andre lande -> '+<cifre>'. */
export function formatPhoneForDisplay(relatelNumber: string): string {
  if (/^45\d{8}$/.test(relatelNumber)) {
    const n = relatelNumber.slice(2)
    return `+45 ${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${n.slice(6, 8)}`
  }
  return `+${relatelNumber}`
}
