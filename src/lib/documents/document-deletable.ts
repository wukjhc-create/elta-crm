/**
 * X-12 (Henrik 2026-10-16): må et dokument slettes? Beskyttet = historik/økonomi/underskrift. Ren funktion (server-
 * handling OG UI bruger den, så knappen kun vises hvor sletning er tilladt). Bevidst IKKE 'use server'.
 */
import { isBesigtigelseDocument } from '@/lib/documents/is-besigtigelse'

export const DELETABLE_DOCUMENT_TYPES: ReadonlySet<string> = new Set(['other', 'internal'])

export interface DeletableDocFields {
  document_type: string | null
  title?: string | null
  description?: string | null
  offer_id?: string | null
  sent_quote_id?: string | null
  source_email_id?: string | null
}

/** null = må slettes; ellers dansk begrundelse */
export function documentDeleteBlockReason(d: DeletableDocFields): string | null {
  if (!d.document_type || !DELETABLE_DOCUMENT_TYPES.has(d.document_type)) {
    return 'Faktura, tilbud, kontrakt/fuldmagt og besigtigelsesrapport er beskyttede og kan ikke slettes'
  }
  // DL-1 (slette-review 2026-10-18): ældre besigtigelsesrapporter står som 'other' med "besigtigelse" i titlen — de kan
  // have bekræftelser fra kunden/installatøren, som ellers slettes kaskade med dokumentet
  if (isBesigtigelseDocument(d.document_type, d.title ?? null)) return 'Besigtigelsesrapport er beskyttet og kan ikke slettes'
  if (d.offer_id || d.sent_quote_id) return 'Dokumentet hører til et tilbud og er beskyttet'
  if (d.source_email_id) return 'Arkiveret mail-vedhæftning — mailen er kilden og dokumentet er beskyttet'
  let descType: string | null = null
  try { descType = d.description ? ((JSON.parse(d.description) as { type?: string }).type ?? null) : null } catch { descType = null }
  if (descType === 'email_attachment' || descType === 'outbound_attachment') return 'Mail-vedhæftning (sendt/modtaget) er historik og beskyttet'
  return null
}
