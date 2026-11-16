/**
 * AI-receptionist — DETERMINISTISK oplysningspolitik (hvad må siges til afsenderen). Ingen LLM-vurdering: modellen
 * hverken vælger niveau eller formulerer kundeoplysninger; svaret bygges af faste skabeloner i engine.composeReply.
 * Bevidst IKKE 'use server'.
 *
 * Final review (mindst mulig oplysning) — se docs/runbooks/ELTA_AI_RECEPTIONIST_PHASE_2_FINAL_REVIEW.md §6:
 *  L0  ukendt / tvetydig / skjult nummer / læsefejl / for mange fejlede forsøg
 *        → kun generel firmaviden. Bekræfter ALDRIG om personen er kunde.
 *  L1  ÉN kandidat via opkalds-nummer, afsender-mail eller oplyst kundenummer (kan forfalskes / er ikke hemmeligt)
 *        → udadtil SAMME som L0. Internt: kandidaten bruges til opslag og bekræftelsesspørgsmål. Intet bekræftes.
 *  L2  L1 + to uafhængige ikke-hemmelige fakta, der passer på kandidaten:
 *        postnr. OG vejnavn  — eller —  sagsnummer OG postnr.   (et sagsnummer ALENE er ikke nok: det står på mails,
 *        fakturaer og papirer og er fortløbende)
 *        → må bekræfte kundeforholdet og oplyse STATUS-KATEGORIEN (fast tekst fra status-enum) for ÉN åben sag.
 *          Aldrig sagstitel/beskrivelse, adresse, datoer, medarbejdernavne, beløb, dokumenter, kontaktdata.
 *  L3  stærk verifikation: gyldigt portal-token (kunden er logget ind i portalen) eller en fremtidig engangskode
 *        → L2 + sagsnumre på åbne sager + planlagt besøgsdato som INFORMATION (aldrig løfte).
 *  Aldrig (uanset niveau, også L3): kontaktdata, beløb/fakturaer/saldi, dokumenter/filer, tekniske/lovgivningsmæssige
 *  vurderinger, garanti-afgørelser — de henvises til portalen eller en medarbejder.
 *
 * Telefonnummer og afsender-mail er ALTID højst en kandidat (L1). Ingen adgangskoder eller sikkerhedsspørgsmål.
 */
import type { IdentityResult } from './identity-match'
import type { Channel } from './contract'

export type DisclosureLevel = 0 | 1 | 2 | 3

export type InfoKind =
  | 'company_info'          // åbningstider, serviceområde, ydelser, standardproces
  | 'relationship_exists'   // "vi kan se, at du er kunde hos os"
  | 'case_status'           // status-KATEGORI (fast enum-tekst) for ÉN åben sag
  | 'case_numbers'          // sagsnumre på åbne sager
  | 'next_visit_date'       // planlagt besøgsdato — som information, aldrig som løfte
  | 'case_details'          // sagstitel/beskrivelse/noter
  | 'contact_details'       // kundens registrerede kontaktdata/adresse
  | 'invoice_amounts'       // beløb, saldi, fakturaer
  | 'documents'             // dokumenter/filer
  | 'employee_names'        // hvem der kommer / er tildelt

/** null = aldrig via AI-receptionisten (uanset niveau) */
export const REQUIRED_LEVEL: Record<InfoKind, DisclosureLevel | null> = {
  company_info: 0,
  relationship_exists: 2,
  case_status: 2,
  case_numbers: 3,
  next_visit_date: 3,
  case_details: null,
  contact_details: null,
  invoice_amounts: null,
  documents: null,
  employee_names: null,
}

export function canDisclose(level: DisclosureLevel, info: InfoKind): boolean {
  const req = REQUIRED_LEVEL[info]
  return req !== null && level >= req
}

/** Det et niveau må vise (til runbook/test — samme kilde som canDisclose) */
export function disclosableAt(level: DisclosureLevel): InfoKind[] {
  return (Object.keys(REQUIRED_LEVEL) as InfoKind[]).filter((k) => canDisclose(level, k))
}

/** Kandidatens kendte ikke-hemmelige fakta (læses server-side; sendes ALDRIG til afsenderen) */
export interface CandidateFacts {
  postalCodes: string[]       // fakturerings-/leverings-postnumre
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
 * Bekræftelse kræver TO fakta: (postnr. OG vejnavn) eller (sagsnummer OG postnr.). Kun eksakt match på normaliserede
 * værdier. Et komplet men forkert svar er 'failed'. Ét faktum alene (fx kun sagsnummer) er 'not_attempted' — der
 * spørges om resten, og intet afsløres.
 */
export function verifyFacts(candidate: CandidateFacts, claimed: ClaimedFacts): VerificationOutcome {
  const pc = normPostal(claimed.postalCode), st = normStreet(claimed.streetName), cn = normCase(claimed.caseNumber)
  const pcOk = !!pc && candidate.postalCodes.map(normPostal).includes(pc)
  const stOk = !!st && candidate.streetNames.map(normStreet).includes(st)
  const cnOk = !!cn && candidate.caseNumbers.map(normCase).includes(cn)
  if ((pcOk && stOk) || (cnOk && pcOk)) return 'verified'
  const complete = (pc && st) || (cn && pc)
  if (complete) return 'failed'
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
