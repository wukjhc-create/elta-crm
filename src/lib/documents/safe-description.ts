/**
 * IDOR-sweep 2026-10-09 (#2): en underskrevet fuldmagts description (JSON) indeholder fødselsdato/CVR, underskrift
 * (billeddata), underskriverens e-mail og samtykke. Medarbejder-lister (kundekort, sagsdokumenter, kundeforløb) må kun
 * få de ufølsomme felter — PDF'en er det juridiske dokument. Andre beskrivelser returneres uændret. Bevidst IKKE 'use server'.
 */
const FULDMAGT_SAFE_KEYS = ['type', 'status', 'signed_at', 'signer_name', 'service_case_id', 'created_at']

export function safeDocumentDescription(description: string | null | undefined): string | null {
  if (!description) return description ?? null
  try {
    const desc = JSON.parse(description) as Record<string, unknown>
    if (desc && typeof desc === 'object' && desc.type === 'fuldmagt') {
      return JSON.stringify(Object.fromEntries(Object.entries(desc).filter(([k]) => FULDMAGT_SAFE_KEYS.includes(k))))
    }
  } catch { /* ikke JSON */ }
  return description
}
