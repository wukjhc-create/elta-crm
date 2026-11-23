/**
 * Publikum/offentliggørelse (00254, 2026-11-23). Bevidst IKKE 'use server' — typer, regler og den ENESTE eksterne
 * læsevej (external_feed) med injiceret klient.
 *
 * Regler (håndhæves i databasen; her kun spejlet til UI/tests):
 *   - Alt importeret indhold er 'internal'. Sagskobling, sagsdeltagelse og kommunikationsklasse giver INGEN ekstern synlighed.
 *   - Ekstern synlighed = en external_publications-række til en BESTEMT part med en BESTEMT publikumstype, oprettet af en
 *     indlogget bruger med portal.publish via publish_external. AI-/baggrundskode kan ikke (ingen service_role-grant,
 *     værnet afviser skrivning uden indlogget bruger).
 *   - Originalen eksponeres aldrig: feedet viser den offentliggjorte tekst; proveniensen (derived_from_*) er intern.
 *   - Mail-vedhæftninger og interne dokumenter kan aldrig offentliggøres.
 */

export const AUDIENCE_KINDS = ['customer', 'partner', 'supplier', 'subcontractor', 'manufacturer'] as const
export type AudienceKind = (typeof AUDIENCE_KINDS)[number]
export type PublicationContentKind = 'message' | 'status_update' | 'document'

export const PARTY_RELATIONSHIPS = ['customer', 'lead', 'supplier', 'cooperation_partner', 'subcontractor', 'manufacturer', 'internal'] as const
export type PartyRelationship = (typeof PARTY_RELATIONSHIPS)[number]

export const CASE_PARTICIPANT_ROLES = [
  'customer', 'end_customer', 'orderer', 'payer', 'site_contact', 'cooperation_partner', 'supplier', 'subcontractor', 'manufacturer', 'internal',
] as const
export type CaseParticipantRole = (typeof CASE_PARTICIPANT_ROLES)[number]

export function isAudienceKind(v: unknown): v is AudienceKind {
  return typeof v === 'string' && (AUDIENCE_KINDS as readonly string[]).includes(v)
}

/** Hvilken intern kilde må danne grundlag for en NY, menneskeskrevet offentliggørelse (aldrig selve originalen)? */
export type PublicationSourceRule = 'never' | 'new_message_only'
export function publicationSourceRule(sourceClass: string): PublicationSourceRule {
  // Interne notater og alt leverandør-/partner-/underleverandør-/producentindhold: aldrig direkte. Personalet kan skrive
  // en ny, separat besked til et publikum — men proveniensen kopierer aldrig indhold.
  if (sourceClass === 'internal_note') return 'never'
  return 'new_message_only'
}

/** Feed-række — eksplicit projektion fra external_feed(). Ingen proveniens, ingen udgiver, ingen interne felter. */
export interface ExternalFeedItem {
  id: string
  service_case_id: string | null
  case_number: string | null
  content_kind: PublicationContentKind
  title: string | null
  body: string | null
  document_id: string | null
  document_title: string | null
  document_file_name: string | null
  document_mime_type: string | null
  published_at: string
}

export const EXTERNAL_FEED_FIELDS: ReadonlyArray<keyof ExternalFeedItem> = [
  'id', 'service_case_id', 'case_number', 'content_kind', 'title', 'body', 'document_id',
  'document_title', 'document_file_name', 'document_mime_type', 'published_at',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * Den ENESTE eksterne læsevej. Kaldes kun af portal-serveren EFTER token → part er løst (service_role-klient).
 * Uden part → tom liste (fail-closed). Felter uden for projektionen fjernes defensivt.
 */
export async function readExternalFeed(admin: Db, audienceKind: AudienceKind, partyId: string | null | undefined): Promise<ExternalFeedItem[]> {
  if (!partyId || !isAudienceKind(audienceKind)) return []
  const { data, error } = await admin.rpc('external_feed', { p_audience_kind: audienceKind, p_party_id: partyId })
  if (error) throw new Error('external_feed fejlede')
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const out: Record<string, unknown> = {}
    for (const k of EXTERNAL_FEED_FIELDS) out[k] = r[k] ?? null
    return out as unknown as ExternalFeedItem
  })
}

/** Portal-token → part. Kunde: parties.customer_id. Partner: partnerens kunderække (partner_access_tokens.partner_customer_id). */
export async function partyIdForCustomerRow(admin: Db, customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null
  const { data, error } = await admin.from('parties').select('id').eq('customer_id', customerId).maybeSingle()
  if (error) return null
  return (data as { id: string } | null)?.id ?? null
}
