import type { LeadStatus } from '@/types/leads.types'

/**
 * Kort tekst om det naeste skridt. Aendrer ikke statusovergange.
 */
export function nextLeadHint(
  status: LeadStatus,
  opts: { hasCustomer: boolean; canConvert: boolean; canCreateOffer: boolean },
): string {
  if (status === 'lost') return 'Næste: genåbn leadet, hvis henvendelsen er aktuel igen.'
  if (status === 'won') return 'Næste: følg kunden. Status kan sættes tilbage til forhandling, hvis vundet var en fejl.'
  if (!opts.hasCustomer && opts.canConvert && (status === 'qualified' || status === 'proposal' || status === 'negotiation')) {
    return 'Næste: opret kunden, så tilbud og portal kan knyttes til den.'
  }
  if (opts.hasCustomer && opts.canCreateOffer && status === 'qualified') return 'Næste: opret tilbuddet.'
  if (opts.hasCustomer && opts.canCreateOffer && (status === 'proposal' || status === 'negotiation')) {
    return 'Næste: følg op på tilbuddet.'
  }
  if (status === 'new') return 'Næste: tag kontakt og sæt status til kontaktet.'
  if (status === 'contacted') return 'Næste: afklar om opgaven er kvalificeret.'
  return 'Næste: opdater status, når der er nyt.'
}
