/**
 * AI-receptionist fase 2 — DETERMINISTISK oplysningspolitik (hvad må siges til afsenderen). Ingen LLM-vurdering.
 * Bevidst IKKE 'use server'.
 *
 *  L0  ukendt / tvetydig / skjult nummer           kun generel firmaviden
 *  L1  kandidat via opkalds-nummer / afsender-mail  må bekræfte et SANDSYNLIGT kundeforhold — ingen sagsoplysninger
 *  L2  L1 + bekræftet ikke-hemmelig kundefakta      (postnr. + vejnavn, eller sagsnummer på kandidaten) → ikke-følsom sagsstatus
 *  L3  stærkere verifikation                        indlogget portal (token) eller fremtidig engangskode → konto-/følsomme oplysninger
 *
 * Telefonnummer og afsender-mail kan forfalskes → giver højst L1. Ingen adgangskoder eller sikkerhedsspørgsmål.
 */
import type { IdentityResult } from './identity-match'
import type { Channel } from './contract'

export type DisclosureLevel = 0 | 1 | 2 | 3

export type InfoKind =
  | 'company_info'          // åbningstider, serviceområde, ydelser, standardproces
  | 'relationship_exists'   // "vi kan se, at du har været i kontakt med os"
  | 'case_list'             // titler på åbne sager
  | 'case_status'           // ikke-følsom status-kategori
  | 'next_visit_date'       // planlagt besøgsdato — som information, aldrig som løfte
  | 'contact_details'       // kundens registrerede kontaktdata
  | 'invoice_amounts'       // beløb, saldi
  | 'documents'             // dokumenter/filer

export const REQUIRED_LEVEL: Record<InfoKind, DisclosureLevel> = {
  company_info: 0,
  relationship_exists: 1,
  case_list: 2,
  case_status: 2,
  next_visit_date: 2,
  contact_details: 3,
  invoice_amounts: 3,
  documents: 3,
}

export function canDisclose(level: DisclosureLevel, info: InfoKind): boolean {
  return level >= REQUIRED_LEVEL[info]
}

/** Kandidatens kendte ikke-hemmelige fakta (læses server-side; sendes ALDRIG til afsenderen) */
export interface CandidateFacts {
  postalCodes: string[]       // fakturerings-/leverings-/sags-postnumre
  streetNames: string[]       // vejnavne uden husnummer (normaliseret)
  caseNumbers: string[]       // kandidatens sagsnumre (SVC-…)
}

/** Det afsenderen selv har oplyst i samtalen */
export interface ClaimedFacts {
  postalCode?: string | null
  streetName?: string | null
  caseNumber?: string | null
}

export type VerificationOutcome = 'verified' | 'failed' | 'not_attempted'

const normPostal = (s: string | null | undefined) => { const d = String(s ?? '').replace(/\D/g, ''); return d.length === 4 ? d : null }
export const normStreet = (s: string | null | undefined) => {
  const t = String(s ?? '').toLowerCase().normalize('NFC').replace(/\d+.*$/, '').replace(/[^a-zæøåäöü\s-]/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length >= 3 ? t : null
}
const normCase = (s: string | null | undefined) => { const t = String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return t.length >= 4 ? t : null }

/**
 * Bekræftelse kræver EN af: (postnr. OG vejnavn) eller kandidatens sagsnummer. Kun eksakt match på normaliserede værdier.
 * Et forkert svar er 'failed' (ikke 'not_attempted').
 */
export function verifyFacts(candidate: CandidateFacts, claimed: ClaimedFacts): VerificationOutcome {
  const pc = normPostal(claimed.postalCode), st = normStreet(claimed.streetName), cn = normCase(claimed.caseNumber)
  if (!pc && !st && !cn) return 'not_attempted'
  if (cn && candidate.caseNumbers.map(normCase).includes(cn)) return 'verified'
  if (pc && st && candidate.postalCodes.map(normPostal).includes(pc) && candidate.streetNames.map(normStreet).includes(st)) return 'verified'
  if (cn || (pc && st)) return 'failed'
  // kun én af postnr./vejnavn oplyst → endnu ikke nok (spørg om resten)
  return 'not_attempted'
}

export interface LevelInput {
  identity: Pick<IdentityResult, 'state'>
  channel: Channel
  verification: VerificationOutcome
  /** Kun sat af portal-adapteren efter gyldig token-validering, eller af en fremtidig engangskode */
  strongVerification: boolean
  /** Antal mislykkede bekræftelsesforsøg i samtalen */
  failedAttempts: number
}

export const MAX_VERIFICATION_ATTEMPTS = 2

export function disclosureLevel(i: LevelInput): DisclosureLevel {
  if (i.identity.state !== 'unique_match') return 0
  if (i.strongVerification) return 3
  if (i.failedAttempts >= MAX_VERIFICATION_ATTEMPTS) return 0
  if (i.verification === 'verified') return 2
  return 1
}
