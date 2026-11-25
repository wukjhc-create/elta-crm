'use server'

/**
 * Parter fase B (00255, 2026-11-25 — docs/runbooks/PARTY_AUDIENCE_PHASE_B_PREFLIGHT.md). INTERN partsforvaltning:
 * parter, relationer og sagsdeltagere. Intet her gør noget synligt for eksterne parter (F-1 er uden for fase B: ingen
 * offentliggørelse, ingen portal-/feed-læsning).
 *
 * Hver handling: feature-flag (PARTIES_UI_ENABLED, standard FRA → "ikke aktiveret", ingen DB-kald) → rettighedstjek →
 * BRUGERENS klient. Skrivning sker KUN via 00255-RPC'erne (databasen tjekker rettighed + synlighed igen og auditerer);
 * direkte INSERT/UPDATE i partstabellerne er umuligt for alle roller. F-6: id'et kommer som RPC'ens returværdi — ingen
 * `.insert().select()` / RETURNING. Læsning går gennem 00254's SELECT-politikker (D-1: salg/bogholderi ser alt, montør kun
 * egne sager).
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import { partiesUiEnabled, PARTIES_DISABLED_TEXT } from '@/lib/parties/feature-flag'
import { normalizePartyDomains, normalizePartyEmails, normalizePartyName, normalizePartyVat } from '@/lib/parties/party-dedupe'
import { CASE_PARTICIPANT_ROLES, PARTY_RELATIONSHIPS, type CaseParticipantRole, type PartyRelationship } from '@/lib/parties/audience'
import type { ActionResult } from '@/types/common.types'

export type PartyKind = 'person' | 'organisation'
export type PartyRegister = 'customer' | 'customer_contact' | 'supplier' | 'lead' | 'profile'

export interface PartyRelationshipRow { id: string; relationship: PartyRelationship; status: 'proposed' | 'active' | 'ended' | 'rejected'; source: 'manual' | 'register' | 'ai_suggestion' }
export interface PartyRow {
  id: string
  kind: PartyKind
  display_name: string
  organisation_party_id: string | null
  customer_id: string | null
  customer_contact_id: string | null
  supplier_id: string | null
  lead_id: string | null
  profile_id: string | null
  verified_emails: string[]
  verified_domains: string[]
  vat_number: string | null
  relationships: PartyRelationshipRow[]
}
export interface PartyCandidate { source: 'party' | 'customer' | 'supplier'; id: string; display_name: string; match: Array<'vat' | 'email' | 'domain' | 'name'> }
export type CreatePartyOutcome =
  | { status: 'created'; partyId: string }
  | { status: 'duplicate_candidates' | 'duplicate_vat'; candidates: PartyCandidate[] }

export interface CustomerPartiesView {
  canManage: boolean
  customerParty: PartyRow | null
  contacts: Array<{ id: string; name: string; party: PartyRow | null }>
  participations: Array<{ id: string; role: CaseParticipantRole; ended_at: string | null; service_case_id: string; case_number: string | null; case_title: string | null }>
}
export interface CaseParticipantRow {
  id: string
  role: CaseParticipantRole
  note: string | null
  ended_at: string | null
  created_at: string
  party: { id: string; display_name: string; kind: PartyKind; customer_id: string | null; supplier_id: string | null } | null
}
export interface CaseParticipantsView { canEdit: boolean; canManage: boolean; participants: CaseParticipantRow[] }

const PARTY_COLUMNS = 'id, kind, display_name, organisation_party_id, customer_id, customer_contact_id, supplier_id, lead_id, profile_id, verified_emails, verified_domains, vat_number'
const REGISTERS: readonly PartyRegister[] = ['customer', 'customer_contact', 'supplier', 'lead', 'profile']

function disabled<T>(): ActionResult<T> {
  return { success: false, error: PARTIES_DISABLED_TEXT }
}

/** RPC-fejl → dansk tekst (ingen databasedetaljer til klienten). */
function rpcErrorText(error: { code?: string | null; message?: string } | null, context: string): string {
  switch (error?.code) {
    case '42501': return 'Du har ikke rettighed til denne handling'
    case '22023': return 'Ugyldige oplysninger'
    case '23505': return 'CVR-nummeret findes allerede på en anden part'
    case 'P0002': return 'Ikke fundet'
    case '23514': return 'Handlingen er ikke tilladt for denne relation'
    default:
      logger.error(`${context} failed`, { error: { code: error?.code } })
      return 'Handlingen kunne ikke gennemføres'
  }
}

function isUuid(v: unknown): v is string {
  try { validateUUID(String(v)); return true } catch { return false }
}

async function loadParties(
  supabase: Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>['supabase'],
  filter: { column: 'id' | 'customer_id' | 'customer_contact_id'; values: string[] },
): Promise<PartyRow[]> {
  if (filter.values.length === 0) return []
  const { data, error } = await supabase.from('parties').select(PARTY_COLUMNS).in(filter.column, filter.values).limit(200)
  if (error) throw new Error('parties read failed')
  const rows = (data ?? []) as Array<Omit<PartyRow, 'relationships'>>
  const ids = rows.map((r) => r.id)
  const { data: rels, error: relError } = ids.length
    ? await supabase.from('party_relationships').select('id, party_id, relationship, status, source').in('party_id', ids).in('status', ['proposed', 'active']).limit(1000)
    : { data: [], error: null }
  if (relError) throw new Error('party_relationships read failed')
  const byParty = new Map<string, PartyRelationshipRow[]>()
  for (const r of (rels ?? []) as Array<PartyRelationshipRow & { party_id: string }>) {
    const list = byParty.get(r.party_id) ?? []
    list.push({ id: r.id, relationship: r.relationship, status: r.status, source: r.source })
    byParty.set(r.party_id, list)
  }
  return rows.map((r) => ({ ...r, relationships: byParty.get(r.id) ?? [] }))
}

// ─── Læsning ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function getCustomerPartiesAction(customerId: string): Promise<ActionResult<CustomerPartiesView>> {
  if (!partiesUiEnabled()) return disabled()
  if (!isUuid(customerId)) return { success: false, error: 'Ugyldig kunde' }
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) return { success: false, error: 'Du har ikke rettighed til denne handling' }
    const { data: contacts, error: cErr } = await supabase.from('customer_contacts').select('id, name').eq('customer_id', customerId).order('name').limit(200)
    if (cErr) throw new Error('contacts read failed')
    const contactRows = (contacts ?? []) as Array<{ id: string; name: string }>
    const [customerParties, contactParties] = await Promise.all([
      loadParties(supabase, { column: 'customer_id', values: [customerId] }),
      loadParties(supabase, { column: 'customer_contact_id', values: contactRows.map((c) => c.id) }),
    ])
    const customerParty = customerParties[0] ?? null
    let participations: CustomerPartiesView['participations'] = []
    if (customerParty) {
      const { data: cps, error: pErr } = await supabase
        .from('case_participants')
        .select('id, role, ended_at, service_case_id, service_cases(case_number, title)')
        .eq('party_id', customerParty.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (pErr) throw new Error('case_participants read failed')
      participations = ((cps ?? []) as unknown as Array<{ id: string; role: CaseParticipantRole; ended_at: string | null; service_case_id: string; service_cases: { case_number: string | null; title: string | null } | null }>)
        .map((r) => ({ id: r.id, role: r.role, ended_at: r.ended_at, service_case_id: r.service_case_id, case_number: r.service_cases?.case_number ?? null, case_title: r.service_cases?.title ?? null }))
    }
    return {
      success: true,
      data: {
        canManage: hasPermission('parties.manage'),
        customerParty,
        contacts: contactRows.map((c) => ({ id: c.id, name: c.name, party: contactParties.find((p) => p.customer_contact_id === c.id) ?? null })),
        participations,
      },
    }
  } catch (error) {
    logger.error('getCustomerPartiesAction failed', { error })
    return { success: false, error: 'Kunne ikke hente parter' }
  }
}

export async function searchPartiesAction(query: string): Promise<ActionResult<PartyRow[]>> {
  if (!partiesUiEnabled()) return disabled()
  const q = (query ?? '').trim().slice(0, 100)
  if (q.length < 2) return { success: true, data: [] }
  try {
    const { supabase } = await getAuthenticatedClientWithRole()
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const { data, error } = await supabase.from('parties').select('id').ilike('display_name', pattern).order('display_name').limit(20)
    if (error) throw new Error('parties search failed')
    return { success: true, data: await loadParties(supabase, { column: 'id', values: ((data ?? []) as Array<{ id: string }>).map((r) => r.id) }) }
  } catch (error) {
    logger.error('searchPartiesAction failed', { error })
    return { success: false, error: 'Søgningen fejlede' }
  }
}

export async function getCaseParticipantsAction(caseId: string): Promise<ActionResult<CaseParticipantsView>> {
  if (!partiesUiEnabled()) return disabled()
  if (!isUuid(caseId)) return { success: false, error: 'Ugyldig sag' }
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    const { data, error } = await supabase
      .from('case_participants')
      .select('id, role, note, ended_at, created_at, party:parties(id, display_name, kind, customer_id, supplier_id)')
      .eq('service_case_id', caseId)
      .order('created_at')
      .limit(200)
    if (error) throw new Error('case_participants read failed')
    const canManage = hasPermission('parties.manage')
    return { success: true, data: { canManage, canEdit: canManage || hasPermission('cases.edit'), participants: (data ?? []) as unknown as CaseParticipantRow[] } }
  } catch (error) {
    logger.error('getCaseParticipantsAction failed', { error })
    return { success: false, error: 'Kunne ikke hente sagsdeltagere' }
  }
}

// ─── Skrivning (kun via 00255-RPC'erne) ─────────────────────────────────────────────────────────────────────────────

export interface CreatePartyInput {
  kind: PartyKind
  displayName: string
  organisationPartyId?: string | null
  verifiedEmails?: string[]
  verifiedDomains?: string[]
  vatNumber?: string | null
  relationship?: PartyRelationship | null
  /** Kun når brugeren bevidst opretter trods dublet-kandidater (≥ 5 tegn; auditeres) */
  confirmNewReason?: string | null
}

/** Validering før RPC'en (databasen validerer igen). Gratis-/privatdomæner kan aldrig være et verificeret domæne. */
function validatePartyFields(input: { displayName: string; verifiedEmails?: string[]; verifiedDomains?: string[]; vatNumber?: string | null; organisationPartyId?: string | null }): string | null {
  const name = (input.displayName ?? '').trim()
  if (name.length < 1 || name.length > 200 || normalizePartyName(name) === null) return 'Navnet er ugyldigt'
  const emails = normalizePartyEmails(input.verifiedEmails)
  if (emails.invalid.length > 0) return 'En eller flere e-mailadresser er ugyldige'
  const domains = normalizePartyDomains(input.verifiedDomains)
  if (domains.invalid.length > 0) return 'Et eller flere domæner er ugyldige'
  if (domains.freeMail.length > 0) return `${domains.freeMail.join(', ')} er et privat-/fællesdomæne og kan ikke være et verificeret domæne`
  if (emails.values.length > 20 || domains.values.length > 20) return 'Højst 20 e-mails og 20 domæner'
  if (normalizePartyVat(input.vatNumber) === 'invalid') return 'CVR-nummeret er ugyldigt (8–14 cifre)'
  if (input.organisationPartyId && !isUuid(input.organisationPartyId)) return 'Ugyldig organisation'
  return null
}

export async function createPartyAction(input: CreatePartyInput): Promise<ActionResult<CreatePartyOutcome>> {
  if (!partiesUiEnabled()) return disabled()
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('parties.manage')) return { success: false, error: 'Du har ikke rettighed til denne handling' }
    if (input.kind !== 'person' && input.kind !== 'organisation') return { success: false, error: 'Ugyldig type' }
    if (input.relationship && !(PARTY_RELATIONSHIPS as readonly string[]).includes(input.relationship)) return { success: false, error: 'Ugyldig relation' }
    const invalid = validatePartyFields(input)
    if (invalid) return { success: false, error: invalid }
    const reason = input.confirmNewReason?.trim() || null
    if (reason !== null && reason.length < 5) return { success: false, error: 'Begrundelsen skal være mindst 5 tegn' }
    const { data, error } = await supabase.rpc('create_party', {
      p_kind: input.kind,
      p_display_name: input.displayName.trim(),
      p_organisation_party_id: input.organisationPartyId || null,
      p_verified_emails: normalizePartyEmails(input.verifiedEmails).values,
      p_verified_domains: normalizePartyDomains(input.verifiedDomains).values,
      p_vat_number: input.vatNumber?.trim() || null,
      p_relationship: input.relationship || null,
      p_confirm_new_reason: reason,
    })
    if (error) return { success: false, error: rpcErrorText(error, 'create_party') }
    const r = data as { status: string; party_id?: string; candidates?: PartyCandidate[] }
    if (r.status === 'created' && r.party_id) return { success: true, data: { status: 'created', partyId: r.party_id } }
    if (r.status === 'duplicate_candidates' || r.status === 'duplicate_vat') return { success: true, data: { status: r.status, candidates: r.candidates ?? [] } }
    return { success: false, error: 'Uventet svar' }
  } catch (error) {
    logger.error('createPartyAction failed', { error })
    return { success: false, error: 'Parten kunne ikke oprettes' }
  }
}

export interface UpdatePartyInput {
  partyId: string
  displayName: string
  organisationPartyId?: string | null
  verifiedEmails?: string[]
  verifiedDomains?: string[]
  vatNumber?: string | null
}

export async function updatePartyAction(input: UpdatePartyInput): Promise<ActionResult> {
  if (!partiesUiEnabled()) return disabled()
  if (!isUuid(input.partyId)) return { success: false, error: 'Ugyldig part' }
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('parties.manage')) return { success: false, error: 'Du har ikke rettighed til denne handling' }
    const invalid = validatePartyFields(input)
    if (invalid) return { success: false, error: invalid }
    const { error } = await supabase.rpc('update_party', {
      p_party_id: input.partyId,
      p_display_name: input.displayName.trim(),
      p_organisation_party_id: input.organisationPartyId || null,
      p_verified_emails: normalizePartyEmails(input.verifiedEmails).values,
      p_verified_domains: normalizePartyDomains(input.verifiedDomains).values,
      p_vat_number: input.vatNumber?.trim() || null,
    })
    if (error) return { success: false, error: rpcErrorText(error, 'update_party') }
    return { success: true }
  } catch (error) {
    logger.error('updatePartyAction failed', { error })
    return { success: false, error: 'Parten kunne ikke rettes' }
  }
}

/** Part for en registerrække (kunde/kontakt/leverandør/lead/medarbejder) — idempotent. Kun parties.manage. */
export async function ensureRegisterPartyAction(register: PartyRegister, registerId: string): Promise<ActionResult<{ partyId: string; created: boolean; warnings: string[] }>> {
  if (!partiesUiEnabled()) return disabled()
  if (!REGISTERS.includes(register) || !isUuid(registerId)) return { success: false, error: 'Ugyldige oplysninger' }
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('parties.manage')) return { success: false, error: 'Du har ikke rettighed til denne handling' }
    const { data, error } = await supabase.rpc('ensure_register_party', { p_register: register, p_register_id: registerId })
    if (error) return { success: false, error: rpcErrorText(error, 'ensure_register_party') }
    const r = data as { status: string; party_id: string; warnings?: string[] }
    return { success: true, data: { partyId: r.party_id, created: r.status === 'created', warnings: r.warnings ?? [] } }
  } catch (error) {
    logger.error('ensureRegisterPartyAction failed', { error })
    return { success: false, error: 'Parten kunne ikke oprettes' }
  }
}

export async function setPartyRelationshipAction(partyId: string, relationship: PartyRelationship, evidence?: string[]): Promise<ActionResult> {
  if (!partiesUiEnabled()) return disabled()
  if (!isUuid(partyId) || !(PARTY_RELATIONSHIPS as readonly string[]).includes(relationship)) return { success: false, error: 'Ugyldige oplysninger' }
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('parties.manage')) return { success: false, error: 'Du har ikke rettighed til denne handling' }
    const ev = (evidence ?? []).map((e) => e.trim()).filter(Boolean).slice(0, 10)
    const { error } = await supabase.rpc('set_party_relationship', { p_party_id: partyId, p_relationship: relationship, p_evidence: ev })
    if (error) return { success: false, error: rpcErrorText(error, 'set_party_relationship') }
    return { success: true }
  } catch (error) {
    logger.error('setPartyRelationshipAction failed', { error })
    return { success: false, error: 'Relationen kunne ikke gemmes' }
  }
}

export async function endPartyRelationshipAction(relationshipId: string, status: 'ended' | 'rejected'): Promise<ActionResult> {
  if (!partiesUiEnabled()) return disabled()
  if (!isUuid(relationshipId) || (status !== 'ended' && status !== 'rejected')) return { success: false, error: 'Ugyldige oplysninger' }
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('parties.manage')) return { success: false, error: 'Du har ikke rettighed til denne handling' }
    const { error } = await supabase.rpc('end_party_relationship', { p_relationship_id: relationshipId, p_status: status })
    if (error) return { success: false, error: rpcErrorText(error, 'end_party_relationship') }
    return { success: true }
  } catch (error) {
    logger.error('endPartyRelationshipAction failed', { error })
    return { success: false, error: 'Relationen kunne ikke afsluttes' }
  }
}

function validParticipant(caseId: string, role: string, note?: string | null): string | null {
  if (!isUuid(caseId)) return 'Ugyldig sag'
  if (!(CASE_PARTICIPANT_ROLES as readonly string[]).includes(role)) return 'Ugyldig rolle'
  if (note && note.length > 500) return 'Noten er for lang (højst 500 tegn)'
  return null
}

/** Eksisterende, synlig part som deltager (kobling). parties.manage ELLER cases.edit. */
export async function addCaseParticipantAction(caseId: string, partyId: string, role: CaseParticipantRole, note?: string | null): Promise<ActionResult<{ participantId: string; status: string }>> {
  if (!partiesUiEnabled()) return disabled()
  const invalid = validParticipant(caseId, role, note) ?? (isUuid(partyId) ? null : 'Ugyldig part')
  if (invalid) return { success: false, error: invalid }
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('parties.manage') && !hasPermission('cases.edit')) return { success: false, error: 'Du har ikke rettighed til denne handling' }
    const { data, error } = await supabase.rpc('add_case_participant', { p_case_id: caseId, p_party_id: partyId, p_role: role, p_note: note?.trim() || null })
    if (error) return { success: false, error: rpcErrorText(error, 'add_case_participant') }
    const r = data as { status: string; participant_id: string }
    return { success: true, data: { participantId: r.participant_id, status: r.status } }
  } catch (error) {
    logger.error('addCaseParticipantAction failed', { error })
    return { success: false, error: 'Deltageren kunne ikke tilføjes' }
  }
}

/**
 * Sagsdeltager-flowet med register-part: opretter/kobler den nødvendige part og tilføjer deltageren. cases.edit uden
 * parties.manage må KUN bruge sagens egne kunder/kontakter (databasen håndhæver det); alt andet kræver parties.manage.
 */
export async function addCaseParticipantFromRegisterAction(caseId: string, register: PartyRegister, registerId: string, role: CaseParticipantRole, note?: string | null): Promise<ActionResult<{ participantId: string; partyId: string; status: string; warnings: string[] }>> {
  if (!partiesUiEnabled()) return disabled()
  const invalid = validParticipant(caseId, role, note) ?? (REGISTERS.includes(register) && isUuid(registerId) ? null : 'Ugyldige oplysninger')
  if (invalid) return { success: false, error: invalid }
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    const canManage = hasPermission('parties.manage')
    if (!canManage && !hasPermission('cases.edit')) return { success: false, error: 'Du har ikke rettighed til denne handling' }
    if (!canManage && register !== 'customer' && register !== 'customer_contact') return { success: false, error: 'Du har ikke rettighed til denne handling' }
    const { data, error } = await supabase.rpc('add_case_participant_for_register', {
      p_case_id: caseId, p_register: register, p_register_id: registerId, p_role: role, p_note: note?.trim() || null,
    })
    if (error) return { success: false, error: rpcErrorText(error, 'add_case_participant_for_register') }
    const r = data as { status: string; participant_id: string; party_id: string; warnings?: string[] }
    return { success: true, data: { participantId: r.participant_id, partyId: r.party_id, status: r.status, warnings: r.warnings ?? [] } }
  } catch (error) {
    logger.error('addCaseParticipantFromRegisterAction failed', { error })
    return { success: false, error: 'Deltageren kunne ikke tilføjes' }
  }
}

export async function endCaseParticipantAction(participantId: string): Promise<ActionResult> {
  if (!partiesUiEnabled()) return disabled()
  if (!isUuid(participantId)) return { success: false, error: 'Ugyldig deltager' }
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('parties.manage') && !hasPermission('cases.edit')) return { success: false, error: 'Du har ikke rettighed til denne handling' }
    const { error } = await supabase.rpc('end_case_participant', { p_participant_id: participantId })
    if (error) return { success: false, error: rpcErrorText(error, 'end_case_participant') }
    return { success: true }
  } catch (error) {
    logger.error('endCaseParticipantAction failed', { error })
    return { success: false, error: 'Deltageren kunne ikke afsluttes' }
  }
}
