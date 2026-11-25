import type { CaseParticipantRole, PartyRelationship } from '@/lib/parties/audience'

export const RELATIONSHIP_LABELS: Record<PartyRelationship, string> = {
  customer: 'Kunde',
  lead: 'Emne',
  supplier: 'Leverandør',
  cooperation_partner: 'Samarbejdspartner',
  subcontractor: 'Underleverandør',
  manufacturer: 'Producent',
  internal: 'Intern',
}

export const PARTICIPANT_ROLE_LABELS: Record<CaseParticipantRole, string> = {
  customer: 'Kunde',
  end_customer: 'Slutkunde',
  orderer: 'Ordregiver',
  payer: 'Betaler',
  site_contact: 'Kontakt på stedet',
  cooperation_partner: 'Samarbejdspartner',
  supplier: 'Leverandør',
  subcontractor: 'Underleverandør',
  manufacturer: 'Producent',
  internal: 'Intern',
}

/** Relationer et menneske kan registrere manuelt (register-relationer følger registret) */
export const MANUAL_RELATIONSHIPS: readonly PartyRelationship[] = ['cooperation_partner', 'subcontractor', 'manufacturer', 'supplier', 'customer', 'lead']

export const MATCH_LABELS: Record<string, string> = { vat: 'CVR', email: 'e-mail', domain: 'domæne', name: 'navn' }

export const PARTY_INTERNAL_NOTE = 'Kun internt — parter og deltagere er aldrig synlige i kunde-, partner- eller leverandørportalen.'
