/**
 * K5 — sikker confidence-model for automatisk kobling af mails til kunder (Henrik 2026-10-06). Ren logik.
 *
 *   - Præcis e-mail/kontakt-match på ÉN kunde        → kobles automatisk (høj sikkerhed)
 *   - Samme samtale (conversation_id) med ÉN kunde      → kobles automatisk (høj sikkerhed)
 *   - Kun domæne-match på ÉN kunde                      → FORSLAG til manuel gennemgang (kobles ikke)
 *   - Flere mulige kunder på et niveau (tvetydigt)      → ALDRIG automatisk; forslag med kandidaterne
 *   - Intet match                                       → ingenting
 * Værn uden for denne funktion: en mail der allerede har en kunde (manuel/godkendt/tidligere kobling) overskrives
 * aldrig, og hver automatisk kobling + hvert forslag audit-logges (lib/services/email-autolink.ts).
 */
export type AutoLinkSignals = {
  /** Aktive kunder hvis customers.email = afsenderens (oprindelige) adresse */
  exactCustomerIds: string[]
  /** Kunder hvis kontaktperson (customer_contacts.email) = afsenderens adresse */
  contactCustomerIds: string[]
  /** Kunder som allerede koblede mails i samme samtale tilhører */
  threadCustomerIds: string[]
  /** Aktive kunder med samme firmadomæne (aldrig gratis-mail/eget domæne) */
  domainCustomerIds: string[]
}

export type AutoLinkDecision =
  | { action: 'link'; customerId: string; matchedOn: 'email' | 'contact' | 'thread'; reason: string }
  | { action: 'suggest'; candidateIds: string[]; matchedOn: 'domain' | 'ambiguous'; reason: string }
  | { action: 'none'; reason: string }

const uniq = (ids: string[]) => Array.from(new Set(ids.filter(Boolean)))

export function decideAutoLink(s: AutoLinkSignals): AutoLinkDecision {
  const direct = uniq([...s.exactCustomerIds, ...s.contactCustomerIds])
  if (direct.length === 1) {
    const viaContact = !s.exactCustomerIds.includes(direct[0])
    return { action: 'link', customerId: direct[0], matchedOn: viaContact ? 'contact' : 'email', reason: viaContact ? 'præcis kontakt-e-mail' : 'præcis kunde-e-mail' }
  }
  if (direct.length > 1) {
    return { action: 'suggest', candidateIds: direct, matchedOn: 'ambiguous', reason: `e-mailen findes på ${direct.length} kunder` }
  }
  const thread = uniq(s.threadCustomerIds)
  if (thread.length === 1) return { action: 'link', customerId: thread[0], matchedOn: 'thread', reason: 'samme samtale som en koblet mail' }
  if (thread.length > 1) return { action: 'suggest', candidateIds: thread, matchedOn: 'ambiguous', reason: `samtalen er koblet til ${thread.length} kunder` }
  const domain = uniq(s.domainCustomerIds)
  if (domain.length >= 1) {
    return { action: 'suggest', candidateIds: domain, matchedOn: domain.length === 1 ? 'domain' : 'ambiguous', reason: domain.length === 1 ? 'kun firmadomæne-match' : `domænet findes på ${domain.length} kunder` }
  }
  return { action: 'none', reason: 'intet match' }
}
