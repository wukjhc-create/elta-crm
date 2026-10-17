/**
 * Besigtigelsesrapport? Ren logik — bevidst IKKE 'use server'. Samme regel som afsendelsen i actions/besigtigelse.ts:
 * document_type 'besigtigelse', eller 'other' med "besigtigelse" i titlen (ældre uploads).
 */
export function isBesigtigelseDocument(documentType: string | null | undefined, title: string | null | undefined): boolean {
  if (documentType === 'besigtigelse') return true
  if (documentType === 'other' && typeof title === 'string' && title.toLowerCase().includes('besigtigelse')) return true
  return false
}
