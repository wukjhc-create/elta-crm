/**
 * Er dokumentet en fuldmagt? (contract med description.type = 'fuldmagt'). Fuldmagter indeholder CPR/CVR og underskrift
 * og udleveres KUN via fuldmagt-sektionen med underskriver-tjek — aldrig i kunde- eller partnerportalens dokumentlister.
 * Delt af kundeportal, partnerportal og partner-download (S1-review 2026-10-08). Bevidst IKKE 'use server'.
 */
export function isFuldmagtDocument(d: { document_type?: string | null; description?: string | null }): boolean {
  if (d.document_type !== 'contract') return false
  try {
    return (JSON.parse(d.description || '{}') as { type?: string }).type === 'fuldmagt'
  } catch {
    return false
  }
}
