'use server'
import { secretTokenReader, PORTAL_TOKEN_PUBLIC_COLUMNS } from '@/lib/portal/token-reader'

import { revalidatePath } from 'next/cache'
import { createClient, createAnonClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedClient, getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import type { Permission } from '@/lib/auth/permissions'

/**
 * RBAC app-lag (P-006): actions med EKSTERN effekt/adgang (portal-/partner-tokens, integrationer, afsendelse)
 * var ugatede — enhver indlogget kunne kalde dem direkte. Kraever nu den relevante rettighed.
 */
async function requireGate(permission: Permission) {
  const ctx = await getAuthenticatedClientWithRole()
  ctx.requirePermission(permission)
  return ctx
}
import { headers } from 'next/headers'
import { logOfferActivity } from '@/lib/actions/offer-activities'
import { convertOfferToCase } from '@/lib/services/offer-to-case'
import { emitOfferEvent } from '@/lib/services/webhook-dispatch'
import { sendEmail } from '@/lib/email/email-service'
import { isGraphConfigured, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import { readSmtpSettingsServerOnly } from '@/lib/services/smtp-settings'
import { isInternalEmail } from '@/lib/services/mail-routing'
import { MAX_FILE_SIZE, APP_URL } from '@/lib/constants'
import type {
  PortalAccessToken,
  PortalAccessTokenWithCustomer,
  PortalSession,
  PortalOffer,
  PortalMessage,
  PortalMessageWithRelations,
  OfferSignature,
  CreatePortalTokenData,
  SendPortalMessageData,
  AcceptOfferData,
  PortalAttachment,
  UploadAttachmentResult,
  PortalInvoice,
} from '@/types/portal.types'
import type { ActionResult } from '@/types/common.types'
import { logger } from '@/lib/utils/logger'
import {
  REJECTION_REASON_LABELS,
  type OfferRejectionInput,
} from '@/types/offers.types'
import { escapeHtml, escapeHtmlWithLineBreaks } from '@/lib/utils/html-escape'
import { isBookedCustomerBesigtigelse, isPortalBesigtigelseRequest } from '@/lib/tasks/besigtigelse-task'
import { isFuldmagtDocument } from '@/lib/documents/is-fuldmagt'

// =====================================================
// Portal Token Management (for employees)
// =====================================================

// Create portal access token for a customer
export async function createPortalToken(
  data: CreatePortalTokenData
): Promise<ActionResult<PortalAccessToken>> {
  try {
    const { supabase, userId } = await requireGate('offers.send')

    // Idempotens: bloker en ny adgang hvis kunden allerede har en aktiv.
    // Forhindrer dublet-tokens ved gentagne klik ("Opret adgang").
    // Udløbne-men-aktive tokens tæller ikke: de deaktiveres, så kunden kan få et nyt link (G3).
    const nowIso = new Date().toISOString()
    await supabase
      .from('portal_access_tokens')
      .update({ is_active: false })
      .eq('customer_id', data.customer_id)
      .eq('is_active', true)
      .lte('expires_at', nowIso)
    const { data: existing } = await supabase
      .from('portal_access_tokens')
      .select('id')
      .eq('customer_id', data.customer_id)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1)
      .maybeSingle()
    if (existing) {
      return { success: false, error: 'Der findes allerede en aktiv adgang for denne kunde' }
    }

    // Generate secure token
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const token = Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    const { data: tokenData, error } = await supabase
      .from('portal_access_tokens')
      .insert({
        customer_id: data.customer_id,
        email: data.email,
        token,
        // Kunde-review 2026-10-08 (#1): standard-udløb (før uendeligt) — som partneradgang
        expires_at: data.expires_at || new Date(Date.now() + 365 * 86_400_000).toISOString(),
        created_by: userId,
      })
      .select(PORTAL_TOKEN_PUBLIC_COLUMNS) // token-kolonnen er skjult for bruger-sessionen (00175)
      .single()

    if (error) {
      logger.error('Error creating portal token', { error: error })
      return { success: false, error: 'Kunne ikke oprette portal-adgang' }
    }

    revalidatePath('/customers')
    return { success: true, data: { ...(tokenData as object), token } as PortalAccessToken }
  } catch (error) {
    logger.error('Error in createPortalToken', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get portal tokens for a customer
export async function getPortalTokens(
  customerId: string
): Promise<ActionResult<PortalAccessToken[]>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()

    // P-009 (00175): selve tokenet (= fuld kundeadgang) kun til roller der administrerer portal-adgang (offers.send);
    // oevrige ser status/udloeb uden token. Bruger-sessionen kan ikke laese token-kolonnen.
    const canSeeToken = hasPermission('offers.send')
    const reader = canSeeToken ? await secretTokenReader() : supabase
    const { data, error } = await reader
      .from('portal_access_tokens')
      .select(canSeeToken ? '*' : PORTAL_TOKEN_PUBLIC_COLUMNS)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching portal tokens', { error: error })
      return { success: false, error: 'Kunne ikke hente portal-adgange' }
    }

    return { success: true, data: data as unknown as PortalAccessToken[] }
  } catch (error) {
    logger.error('Error in getPortalTokens', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Deactivate portal token
export async function deactivatePortalToken(
  tokenId: string
): Promise<ActionResult> {
  try {
    const { supabase, userId } = await requireGate('offers.send')

    const { error } = await supabase
      .from('portal_access_tokens')
      .update({ is_active: false })
      .eq('id', tokenId)

    if (error) {
      logger.error('Error deactivating token', { error: error })
      return { success: false, error: 'Kunne ikke deaktivere adgang' }
    }

    revalidatePath('/customers')
    return { success: true }
  } catch (error) {
    logger.error('Error in deactivatePortalToken', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal Access (for customers via token)
// =====================================================

// Validate portal token and get session.
//
// Phase α.2 trin 1: bruger createAdminClient (service-role) saa anon-client
// ikke laengere skal have SELECT/UPDATE-adgang til portal_access_tokens.
// Anon-policy paa tabellen forbliver indtil trin 3-migration; denne
// refactor er forudsaetningen for at fjerne policy'en sikkert.
//
// Defense-in-depth:
//   - Token-format-validering foer DB-kald (64-char hex)
//   - expires_at-tjek baade i SQL og i JS
//   - is_active-tjek bevaret
export async function validatePortalToken(
  token: string
): Promise<ActionResult<PortalSession>> {
  try {
    // Hurtig input-validering: portal-tokens er 64-char lowercase hex
    // (32 bytes via crypto.getRandomValues). Afvis aabenlyst ugyldige
    // foer vi rammer DB.
    if (!token || typeof token !== 'string' || !/^[a-f0-9]{32,128}$/i.test(token)) {
      return { success: false, error: 'Ugyldig eller udløbet adgang' }
    }

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data: tokenData, error } = await supabase
      .from('portal_access_tokens')
      .select(`
        *,
        customer:customers(
          id,
          customer_number,
          company_name,
          contact_person,
          email,
          is_active
        )
      `)
      .eq('token', token)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .maybeSingle()

    if (error || !tokenData) {
      return { success: false, error: 'Ugyldig eller udløbet adgang' }
    }

    // Kunde-review 2026-10-08 (#1): deaktiveret kunde → linket virker ikke (genaktivering giver adgang igen)
    if ((tokenData.customer as { is_active?: boolean | null } | null)?.is_active === false) {
      return { success: false, error: 'Ugyldig eller udløbet adgang' }
    }

    // JS-niveau expiry-tjek (ekstra forsvar mod clock drift / SQL-edge cases)
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return { success: false, error: 'Adgangen er udløbet' }
    }

    // Update last accessed timestamp — best-effort, ingen retur-fejl hvis det fejler
    await supabase
      .from('portal_access_tokens')
      .update({ last_accessed_at: nowIso })
      .eq('id', tokenData.id)

    const session: PortalSession = {
      token: tokenData.token,
      customer_id: tokenData.customer_id,
      customer: tokenData.customer,
      expires_at: tokenData.expires_at,
    }

    return { success: true, data: session }
  } catch (error) {
    logger.error('Error in validatePortalToken', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get offers for customer (portal view)
/** Kunde-sikre tilbudslinjefelter (= PortalOfferLineItem). ALDRIG select('*') mod kunden: linjerne har
 *  kostpris, leverandørkost, margin og interne noter, som ellers sendes med til kundens browser. */
const PORTAL_LINE_ITEM_COLUMNS = 'id, offer_id, position, description, quantity, unit, unit_price, discount_percentage, total'

export async function getPortalOffers(
  token: string
): Promise<ActionResult<PortalOffer[]>> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    // Phase α.3 trin 4+5: offers/offer_line_items/offer_signatures
    // anon-policies droppet i 00131. Bruger admin-client + customer_id-
    // scope paa offers, derefter offer_id-scope paa de afledte queries
    // (offer_ids stammer fra den filtrerede offer-liste, saa de er per
    // definition kunde-ejede).
    const supabase = createAdminClient()
    const customerId = sessionResult.data.customer_id

    let offersQuery = supabase
      .from('offers')
      .select('*')
      .eq('customer_id', customerId)
      .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
    // 00203 (staging): kun den gældende revision vises — afløste revisioner skjules
    const { offerRevisionsEnabled } = await import('@/lib/offers/revisions')
    if (offerRevisionsEnabled()) offersQuery = offersQuery.is('superseded_by', null)
    const { data: offers, error } = await offersQuery
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      logger.error('Error fetching portal offers', { error: error })
      return { success: false, error: 'Kunne ikke hente tilbud' }
    }

    if (!offers || offers.length === 0) {
      return { success: true, data: [] }
    }

    // Get all offer IDs for batch queries
    const offerIds = offers.map((o) => o.id)

    // Batch fetch all line items and signatures (avoids N+1 queries).
    // Scope-sikkerhed: offerIds er filtreret paa customer_id ovenfor,
    // saa .in('offer_id', offerIds) er per definition kunde-scoped.
    const [lineItemsResult, signaturesResult] = await Promise.all([
      supabase
        .from('offer_line_items')
        .select(PORTAL_LINE_ITEM_COLUMNS)
        .in('offer_id', offerIds)
        .order('position'),
      supabase
        .from('offer_signatures')
        .select('*')
        .in('offer_id', offerIds),
    ])

    // Create lookup maps for efficient access
    type LineItem = NonNullable<typeof lineItemsResult.data>[number]
    type Signature = NonNullable<typeof signaturesResult.data>[number]
    const lineItemsByOffer = new Map<string, LineItem[]>()
    const signaturesByOffer = new Map<string, Signature | null>()

    lineItemsResult.data?.forEach((item) => {
      const existing = lineItemsByOffer.get(item.offer_id) || []
      existing.push(item)
      lineItemsByOffer.set(item.offer_id, existing)
    })

    signaturesResult.data?.forEach((sig) => {
      signaturesByOffer.set(sig.offer_id, sig)
    })

    // Build result without additional queries
    const offersWithItems: PortalOffer[] = offers.map((offer) => ({
      id: offer.id,
      offer_number: offer.offer_number,
      title: offer.title,
      description: offer.description,
      status: offer.status,
      total_amount: offer.total_amount,
      discount_percentage: offer.discount_percentage,
      discount_amount: offer.discount_amount,
      tax_percentage: offer.tax_percentage,
      tax_amount: offer.tax_amount,
      final_amount: offer.final_amount,
      currency: offer.currency,
      valid_until: offer.valid_until,
      terms_and_conditions: offer.terms_and_conditions,
      sent_at: offer.sent_at,
      viewed_at: offer.viewed_at,
      accepted_at: offer.accepted_at,
      rejected_at: offer.rejected_at,
      created_at: offer.created_at,
      line_items: lineItemsByOffer.get(offer.id) || [],
      signature: signaturesByOffer.get(offer.id) || null,
      sales_person: {
        full_name: null,
        email: '',
        phone: null,
      },
    }))

    return { success: true, data: offersWithItems }
  } catch (error) {
    logger.error('Error in getPortalOffers', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get single offer for portal
export async function getPortalOffer(
  token: string,
  offerId: string
): Promise<ActionResult<PortalOffer>> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    // Phase α.3 trin 4+5: alle offer-related anon-policies droppet i 00131.
    // En enkelt admin-client haandterer SELECT/UPDATE; customer_id-scope
    // sikres app-side via .eq() paa hver query.
    const admin = createAdminClient()
    const customerId = sessionResult.data.customer_id

    const { data: offer, error } = await admin
      .from('offers')
      .select('*')
      .eq('id', offerId)
      .eq('customer_id', customerId)
      // Q10: som tilbudslisten — kladder (ikke sendt) kunne ellers åbnes via UUID
      .in('status', ['sent', 'viewed', 'accepted', 'rejected'])
      .maybeSingle()

    // 00203 (staging): en afløst revision vises ikke — kunden henvises til den gældende version
    if (offer) {
      const { supersededBy } = await import('@/lib/offers/revisions')
      if (await supersededBy(offerId)) {
        return { success: false, error: 'Dette tilbud er erstattet af en nyere version — se dine tilbud i oversigten' }
      }
    }

    if (error || !offer) {
      logger.error('Error fetching offer', { error: error })
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    // Mark as viewed if first time. Eksplicit customer_id-scope paa UPDATE
    // for defense-in-depth — selv om offer.customer_id er verificeret ovenfor.
    if (!offer.viewed_at && offer.status === 'sent') {
      const { data: viewedRows } = await admin
        .from('offers')
        .update({
          viewed_at: new Date().toISOString(),
          status: 'viewed',
        })
        .eq('id', offerId)
        .eq('customer_id', customerId)
        // tilbuds-review 2026-10-07: kun fra 'sent' — en samtidig accept/kladde (telefon/medarbejder) blev overskrevet
        .eq('status', 'sent')
        .is('viewed_at', null)
        .select('id')

      // Henrik 2026-10-10: personlig notifikation til tilbuddets opretter (kun hvis brugeren har slået den til)
      if ((viewedRows ?? []).length > 0) {
        const { notifyUser } = await import('@/lib/notifications/user-notify')
        const title = escapeHtml(String(offer.title ?? ''))
        const link = `${APP_URL}/dashboard/offers/${offerId}`
        await notifyUser(offer.created_by as string | null, 'offer_viewed', {
          subject: `Tilbud set af kunden: ${offer.offer_number ?? ''}`.trim(),
          html: `<p>Kunden har åbnet tilbuddet <strong>${title}</strong> i kundeportalen.</p><p><a href="${link}">Åbn tilbuddet</a></p>`,
          text: `Kunden har åbnet tilbuddet "${offer.title ?? ''}" i kundeportalen.
${link}`,
        })
      }

      // Log view activity (anon-INSERT droppet i 00124)
      await admin.from('offer_activities').insert({
        offer_id: offerId,
        activity_type: 'viewed',
        description: 'Tilbud åbnet i kundeportalen',
        performed_by: null,
        metadata: { viewedViaPortal: true },
      })

      // Webhook offer.viewed — kaster aldrig (kunden er ikke logget ind; tidligere -> redirect til oversigten)
      await emitOfferEvent(admin, offerId, 'offer.viewed')
    }

    // Get line items — offer_id er allerede customer-scoped via offer-SELECT
    const { data: lineItems } = await admin
      .from('offer_line_items')
      .select(PORTAL_LINE_ITEM_COLUMNS)
      .eq('offer_id', offerId)
      .order('position')

    // Get signature if exists
    const { data: signature } = await admin
      .from('offer_signatures')
      .select('*')
      .eq('offer_id', offerId)
      .maybeSingle()

    const portalOffer: PortalOffer = {
      id: offer.id,
      offer_number: offer.offer_number,
      title: offer.title,
      description: offer.description,
      status: offer.status,
      total_amount: offer.total_amount,
      discount_percentage: offer.discount_percentage,
      discount_amount: offer.discount_amount,
      tax_percentage: offer.tax_percentage,
      tax_amount: offer.tax_amount,
      final_amount: offer.final_amount,
      currency: offer.currency,
      valid_until: offer.valid_until,
      terms_and_conditions: offer.terms_and_conditions,
      sent_at: offer.sent_at,
      viewed_at: offer.viewed_at,
      accepted_at: offer.accepted_at,
      rejected_at: offer.rejected_at,
      created_at: offer.created_at,
      line_items: lineItems || [],
      signature: signature || null,
      // N8: tilbuddets ansvarlige sælger (kun navn + arbejdskontakt; offer er allerede kunde-scopet ovenfor)
      sales_person: await portalSalesPerson(admin, offer.created_by as string | null),
    }

    return { success: true, data: portalOffer }
  } catch (error) {
    logger.error('Error in getPortalOffer', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Accept offer with signature
export async function acceptOffer(
  token: string,
  data: AcceptOfferData
): Promise<ActionResult> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    // Phase α.3 trin 4+5: alle offer-related anon-policies droppet i 00131.
    // Bruger admin-client gennem hele accept-flowet. Kritisk operation,
    // saa hvert step har eksplicit customer_id-scope:
    //   1. SELECT offer m. customer_id-match (afvist hvis offer ikke ejes)
    //   2. INSERT signature paa det verificerede offer_id
    //   3. UPDATE offer status=accepted m. customer_id-scope (defense-in-depth)
    const admin = createAdminClient()
    const customerId = sessionResult.data.customer_id

    // Tilbuds-review 2026-10-09 (#6): server-side validering af underskriften (et direkte kald kunne acceptere uden
    // underskrift eller med vilkårligt store data)
    const signerName = String(data.signer_name ?? '').trim()
    const signerEmail = String(data.signer_email ?? '').trim()
    const signature = String(data.signature_data ?? '')
    if (!signerName || signerName.length > 200) return { success: false, error: 'Angiv dit navn' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail) || signerEmail.length > 254) return { success: false, error: 'Angiv en gyldig e-mail' }
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length < 200 || signature.length > 400_000) {
      return { success: false, error: 'Underskriften mangler — tegn venligst igen' }
    }
    data = { ...data, signer_name: signerName, signer_email: signerEmail }

    // Verify offer belongs to customer and get details for project creation
    const { data: offer, error: offerError } = await admin
      .from('offers')
      .select('id, status, customer_id, title, final_amount, created_by, valid_until, sent_at')
      .eq('id', data.offer_id)
      .eq('customer_id', customerId)
      .maybeSingle()

    if (offerError || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    if (offer.status === 'accepted') {
      return { success: false, error: 'Tilbuddet er allerede accepteret' }
    }

    if (offer.status === 'rejected') {
      return { success: false, error: 'Tilbuddet er allerede afvist' }
    }

    // Server-side guard (UI'en skjuler knappen, men et direkte kald kunne acceptere kladder/udløbne tilbud)
    const { canCustomerRespond, isOfferExpired } = await import('@/lib/offers/validity')
    if (!canCustomerRespond(offer.status as string, offer.valid_until as string | null)) {
      return { success: false, error: isOfferExpired(offer.valid_until as string | null) ? 'Tilbuddet er udløbet — kontakt os for et nyt tilbud' : 'Tilbuddet kan ikke accepteres i denne status' }
    }
    // 00203 (staging): en afløst revision kan ikke accepteres; underskriften bindes til den præcise revisions snapshot
    const { supersededBy, latestSnapshotId } = await import('@/lib/offers/revisions')
    if (await supersededBy(data.offer_id)) {
      return { success: false, error: 'Tilbuddet er erstattet af en nyere version — genindlæs siden' }
    }
    const snapshotId = await latestSnapshotId(data.offer_id)

    // Tilbuds-review 2026-10-09 (#3): accepten bindes til det beløb/den udsendelse kunden så — er tilbuddet ændret og
    // gensendt imens (kladde → ny pris → sendt), afvises den forældede side
    const seenChanged =
      (data.seen_final_amount !== undefined && Math.abs(Number(offer.final_amount ?? 0) - Number(data.seen_final_amount)) > 0.005) ||
      (data.seen_sent_at !== undefined && (data.seen_sent_at ?? null) !== ((offer as { sent_at?: string | null }).sent_at ?? null))
    if (seenChanged) {
      return { success: false, error: 'Tilbuddet er ændret siden du åbnede det — genindlæs siden og gennemse det igen' }
    }

    // Get client IP
    const headersList = await headers()
    const clientIp = headersList.get('x-forwarded-for') ||
                     headersList.get('x-real-ip') ||
                     'unknown'

    // Create signature — offer_id er verificeret kunde-ejet ovenfor
    const { data: sigRow, error: signatureError } = await admin
      .from('offer_signatures')
      .insert({
        offer_id: data.offer_id,
        signer_name: data.signer_name,
        signer_email: data.signer_email,
        signer_ip: clientIp,
        signature_data: data.signature_data,
        ...(snapshotId ? { snapshot_id: snapshotId } : {}),
      })
      .select('id')
      .single()

    if (signatureError || !sigRow) {
      logger.error('Error creating signature', { error: signatureError })
      return { success: false, error: 'Kunne ikke gemme underskrift' }
    }

    // Update offer status — eksplicit customer_id-scope for defense-in-depth
    // Salgs-review: kun hvis tilbuddet STADIG kan besvares — en samtidig afvisning (anden fane) blev ellers overskrevet
    const { data: acceptedRow, error: updateError } = await admin
      .from('offers')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', data.offer_id)
      .eq('customer_id', customerId)
      .in('status', ['sent', 'viewed'])
      // compare-and-set også på beløbet kunden underskrev (tilbuds-review 2026-10-09 #3)
      .eq('final_amount', offer.final_amount as number)
      .select('id')
      .maybeSingle()

    if (!updateError && !acceptedRow) {
      // tilbuddet blev besvaret imens — fjern KUN den netop gemte underskrift (S1 tilbuds-/portal-review 2026-10-07: før
      // .eq('offer_id') → en samtidig dobbelt-accept slettede også den vindende accepts underskrift)
      await admin.from('offer_signatures').delete().eq('id', (sigRow as { id: string }).id)
      return { success: false, error: 'Tilbuddet er netop besvaret — genindlæs siden' }
    }
    if (updateError) {
      await admin.from('offer_signatures').delete().eq('id', (sigRow as { id: string }).id)
      logger.error('Error updating offer', { error: updateError })
      return { success: false, error: 'Kunne ikke opdatere tilbud' }
    }

    // Log acceptance activity — admin-client (anon-INSERT droppet i 00124)
    await admin.from('offer_activities').insert({
      offer_id: data.offer_id,
      activity_type: 'accepted',
      description: `Tilbud accepteret af ${data.signer_name} (${data.signer_email})`,
      performed_by: null,
      metadata: { signerName: data.signer_name, signerEmail: data.signer_email, signerIp: clientIp },
    })

    // D39: før blev et projekt i den gamle projects-model oprettet her med BRUGER-session — kunden er ikke logget ind,
    // så kaldet fejlede altid (AUTH_REQUIRED + fejl-log ved hver accept; prod: 1 projekt / 4 accepterede tilbud).
    // Sagen (service_cases) herunder er den rigtige model.

    // Sprint 3D — auto-create service_case parallel to project (non-critical).
    // Idempotent at app level (offer-to-case.ts) and at DB level (UNIQUE
    // partial index uq_service_cases_source_offer_id, migration 00099).
    // If this fails the operator can use the manual "Opret sag fra
    // tilbud" button on the offer detail as a fallback.
    try {
      // Kunden er ikke logget ind -> service-role; aktør = tilbuddets ansvarlige (sælgeren). Kernen logger selv
      // 'service_case_created' på tilbuddets tidslinje.
      const actorId = (offer.created_by as string | null) ?? (await systemActorId(admin))
      const sagResult = actorId
        ? await convertOfferToCase(admin, data.offer_id, actorId)
        : { success: false as const, error: 'Ingen ansvarlig bruger til sagen' }
      if (sagResult.success && sagResult.data) {
        logger.info('Sag oprettet fra portal-accept', { entity: 'offer', entityId: data.offer_id, metadata: { case_number: sagResult.data.case_number, created: sagResult.data.created } })
      } else {
        logger.error('Auto-create service_case failed', {
          error: sagResult.error,
          entity: 'offer',
          entityId: data.offer_id,
        })
      }
    } catch (sagError) {
      logger.error('Service_case creation failed (non-critical)', {
        error: sagError,
        entity: 'offer',
        entityId: data.offer_id,
      })
      // Don't fail the offer acceptance if sag creation fails.
    }

    // Webhook offer.accepted — kaster aldrig (tidligere: AUTH_REQUIRED -> kunden fik fejl efter gemt underskrift)
    await emitOfferEvent(admin, data.offer_id, 'offer.accepted')

    // Salgspipeline: tilknyttede leads → vundet (kaster aldrig)
    const { markLeadsWonForAcceptedOffer } = await import('@/lib/services/lead-won')
    await markLeadsWonForAcceptedOffer(admin, data.offer_id, null)

    // Henrik 2026-10-10: personlig notifikation til tilbuddets opretter (kun hvis brugeren har slået den til)
    {
      const { notifyUser } = await import('@/lib/notifications/user-notify')
      const link = `${APP_URL}/dashboard/offers/${data.offer_id}`
      await notifyUser(offer.created_by as string | null, 'offer_signed', {
        subject: `Tilbud underskrevet: ${offer.title}`,
        html: `<p>Kunden har accepteret og underskrevet tilbuddet <strong>${escapeHtml(offer.title)}</strong> (${escapeHtml(data.signer_name)}).</p><p><a href="${link}">Åbn tilbuddet</a></p>`,
        text: `Kunden har accepteret og underskrevet tilbuddet "${offer.title}" (${data.signer_name}).
${link}`,
      })
    }

    // Send automatic email confirmation to CRM mailbox
    try {
      // Kunden er ikke logget ind: getSmtpSettings/getCompanySettings krævede en session og fejlede
      // ALTID her (AUTH_REQUIRED i loggen) → mailen brugte env-SMTP. Samme adfærd nu, uden fejl-støj:
      // ingen SMTP-override (env), firmanavn via offentlig kolonne (D29).
      const { data: companyRow } = await admin.from('company_settings').select('company_name').limit(1).maybeSingle()
      const crmMailbox = process.env.GRAPH_MAILBOX || 'kontakt@eltasolar.dk'
      const companyName = (companyRow as { company_name?: string | null } | null)?.company_name || 'Elta Solar'
      const smtpConfig = undefined

      await sendEmail({
        to: crmMailbox,
        subject: `Tilbud accepteret: ${offer.title}`,
        html: `
          <h2>Tilbud accepteret</h2>
          <p>Kunden har accepteret et tilbud via kundeportalen.</p>
          <table style="border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:4px 16px 4px 0;color:#666;">Tilbud:</td><td style="font-weight:600;">${escapeHtml(offer.title)}</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#666;">Underskrevet af:</td><td>${escapeHtml(data.signer_name)} (${escapeHtml(data.signer_email)})</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#666;">Beløb:</td><td style="font-weight:600;">${new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(offer.final_amount)}</td></tr>
            <tr><td style="padding:4px 16px 4px 0;color:#666;">Tidspunkt:</td><td>${new Date().toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}</td></tr>
          </table>
          <p>Se tilbuddet i ELTA Drift: <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app'}/dashboard/offers">Gå til Tilbud</a></p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
          <p style="color:#999;font-size:12px;">Denne email er automatisk genereret af ${companyName} CRM.</p>
        `,
        text: `Tilbud accepteret\n\nKunden har accepteret tilbud: ${offer.title}\nUnderskrevet af: ${data.signer_name} (${data.signer_email})\nBeløb: ${offer.final_amount} DKK\nTidspunkt: ${new Date().toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}\n\nSe tilbuddet i ELTA Drift.`,
      }, smtpConfig)
    } catch (emailError) {
      logger.error('Failed to send acceptance confirmation email', { error: emailError })
      // Non-critical — don't fail the acceptance
    }

    // Phase 10 — autopilot rule engine. Default "offer_accepted →
    // create_invoice_from_offer" rule handles this; idempotent.
    try {
      const { evaluateAndRunAutomations } = await import('@/lib/automation/rule-engine')
      await evaluateAndRunAutomations({
        trigger: 'offer_accepted',
        entityType: 'offer',
        entityId: data.offer_id,
        payload: {
          offer_id: data.offer_id,
          customer_id: customerId,
          final_amount: offer.final_amount,
          title: offer.title,
        },
      })
    } catch (invErr) {
      logger.error('Autopilot offer_accepted failed (non-critical)', { error: invErr, entityId: data.offer_id })
    }

    revalidatePath('/offers')
    revalidatePath('/projects')

    return { success: true }
  } catch (error) {
    logger.error('Error in acceptOffer', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Reject offer (Phase 12A — struktureret reason + audit-felter)
export async function rejectOffer(
  token: string,
  offerId: string,
  input?: OfferRejectionInput | string
): Promise<ActionResult> {
  try {
    // Normalisér input (validerer reason hvis struktureret)
    const { normalizeRejectionInput, captureRejectionMeta } = await import(
      '@/lib/services/offer-rejection'
    )
    let normalized
    try {
      normalized = normalizeRejectionInput(input)
    } catch (err) {
      logger.error('Invalid rejection input', { error: err, entityId: offerId })
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Ugyldig afvisningsårsag',
      }
    }

    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    // Capture IP/UA (best effort)
    let meta = { ip: 'unknown', userAgent: 'unknown' }
    try {
      meta = await captureRejectionMeta()
    } catch (metaErr) {
      logger.error('Failed to capture rejection meta', { error: metaErr })
    }

    // Phase α.3 trin 4+5: alle offer-related anon-policies droppet i 00131.
    // Admin-client + eksplicit customer_id-scope paa baade SELECT og UPDATE.
    const admin = createAdminClient()
    const customerId = sessionResult.data.customer_id

    // Verify offer belongs to customer
    const { data: offer, error: offerError } = await admin
      .from('offers')
      .select('id, status, customer_id, title')
      .eq('id', offerId)
      .eq('customer_id', customerId)
      .maybeSingle()

    if (offerError || !offer) {
      return { success: false, error: 'Tilbud ikke fundet' }
    }

    // Status-transition-guard — kun sent/viewed maa afvises
    if (offer.status === 'accepted') {
      return { success: false, error: 'Tilbuddet er allerede accepteret' }
    }
    if (offer.status === 'rejected') {
      return { success: false, error: 'Tilbuddet er allerede afvist' }
    }
    if (!['sent', 'viewed'].includes(offer.status)) {
      return { success: false, error: 'Tilbuddet kan ikke afvises i denne status' }
    }

    // Update med 6 nye strukturerede felter — eksplicit customer_id-scope
    // for defense-in-depth.
    const { data: rejectedRow, error: updateError } = await admin
      .from('offers')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejection_reason: normalized.reason,
        rejection_note: normalized.note,
        rejected_by_name: normalized.signerName,
        rejected_by_email: normalized.signerEmail,
        rejected_by_ip: meta.ip,
        rejected_by_user_agent: meta.userAgent,
      })
      .eq('id', offerId)
      .eq('customer_id', customerId)
      // Salgs-review: kun hvis tilbuddet stadig er sendt/set — en samtidig accept (anden fane) blev ellers til "afvist"
      .in('status', ['sent', 'viewed'])
      .select('id')
      .maybeSingle()

    if (!updateError && !rejectedRow) {
      return { success: false, error: 'Tilbuddet er netop besvaret — genindlæs siden' }
    }
    if (updateError) {
      logger.error('Error rejecting offer', { error: updateError })
      return { success: false, error: 'Kunne ikke afvise tilbud' }
    }

    const reasonLabel = REJECTION_REASON_LABELS[normalized.reason]

    // Log rejection activity — admin-client (anon-INSERT droppet i 00124)
    await admin.from('offer_activities').insert({
      offer_id: offerId,
      activity_type: 'rejected',
      description: `Tilbud afvist: ${reasonLabel}${normalized.note ? ` — ${normalized.note}` : ''}`,
      performed_by: null,
      metadata: {
        reason: normalized.reason,
        reason_label: reasonLabel,
        note: normalized.note,
        signer_name: normalized.signerName,
        signer_email: normalized.signerEmail,
      },
    })

    // Trigger webhooks for offer.rejected (best effort)
    await emitOfferEvent(admin, offerId, 'offer.rejected')

    // Send email notification to CRM mailbox (non-critical)
    try {
      const crmMailbox = process.env.GRAPH_MAILBOX || 'kontakt@eltasolar.dk'
      const subject = `Tilbud afvist: ${offer.title || offer.id}`
      const signerLine = (normalized.signerName || normalized.signerEmail)
        ? `<p><strong>Afvist af:</strong> ${escapeHtml(
            [normalized.signerName, normalized.signerEmail].filter(Boolean).join(' — ')
          )}</p>`
        : ''
      const html = `
        <h2>Tilbud afvist</h2>
        <p>Kunden har afvist et tilbud via kundeportalen.</p>
        <p><strong>Årsag:</strong> ${escapeHtml(reasonLabel)}</p>
        ${normalized.note ? `<p><strong>Bemærkning:</strong> ${escapeHtml(normalized.note)}</p>` : ''}
        ${signerLine}
        <p>Se tilbuddet i ELTA Drift: <a href="${(process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app').trim()}/dashboard/offers">Gå til Tilbud</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
        <p style="color:#999;font-size:12px;">Denne email er automatisk genereret af ELTA Drift.</p>
      `
      const text = `Tilbud afvist\n\nÅrsag: ${reasonLabel}${normalized.note ? `\nBemærkning: ${normalized.note}` : ''}\n\nSe tilbuddet i ELTA Drift.`

      if (isGraphConfigured()) {
        // Sprint 8H Phase 3: central mail-router (internal_notification).
        const { resolveInternalNotificationRoute, logMailRoute } = await import(
          '@/lib/actions/mail-route-resolvers'
        )
        const routeResult = await resolveInternalNotificationRoute({
          recipientEmail: crmMailbox,
          contextLabel: `offer_rejected:${offerId}`,
        })
        if (routeResult.ok && routeResult.route) {
          const route = routeResult.route
          const sendResult = await sendEmailViaGraph({
            to: route.toEmail,
            subject,
            html,
            text,
          })
          await logMailRoute(
            route,
            sendResult.success ? 'sent' : 'failed',
            { offer_id: offerId, error: sendResult.error }
          )
        }
      } else {
        await sendEmail({ to: crmMailbox, subject, html, text })
      }
    } catch (emailError) {
      logger.error('Failed to send rejection notification', { error: emailError })
    }

    revalidatePath('/offers')

    return { success: true }
  } catch (error) {
    logger.error('Error in rejectOffer', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal Messages
// =====================================================

// Get messages for portal (customer view)
export async function getPortalMessages(
  token: string,
  // Sprint 12B: offerId-param er bevaret for backward-compat men bruges
  // ikke laengere til at filtrere chat-feedet. Kunden ser nu altid én
  // samlet chat pr. customer_id paa tvaers af tilbudssider og dashboard.
  // offer_id paa hver besked bevares som metadata (UI-label).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  offerId?: string
): Promise<ActionResult<PortalMessageWithRelations[]>> {
  try {
    // Validate token first (eksisterende anon-flow indtil Phase alpha.2)
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    // Phase alpha.1: portal_messages anon-policies droppet. Brug
    // service-role server-side til at hente beskeder, scoped til
    // session.customer_id fra valideret token.
    const admin = createAdminClient()
    const customerId = sessionResult.data.customer_id

    // sender_name er gemt direkte paa portal_messages — ingen profiles-join.
    const { data, error } = await admin
      .from('portal_messages')
      .select('id, customer_id, offer_id, sender_type, sender_name, message, attachments, read_at, created_at')
      .eq('customer_id', customerId)
      // Kommunikations-review 2026-10-09 (#6): de NYESTE 500 (før stigende uden grænse → over 1.000 beskeder blev de
      // nyeste skåret af PostgREST og forsvandt), vendt til kronologisk orden nedenfor
      .order('created_at', { ascending: false })
      .limit(CHAT_HISTORY_LIMIT)
    if (data) data.reverse()

    if (error) {
      logger.error('Error fetching portal messages', { error: error })
      return { success: false, error: 'Kunne ikke hente beskeder' }
    }

    // App-side join: hent offer_number/title for unique offer_id'er.
    // Bruger offer-relationen paa PortalMessageWithRelations som UI
    // (portal-chat.tsx) kan render som "Vedr. tilbud <offer_number>".
    // App-side join undgaar PGRST201 FK-ambiguity paa offers→customers.
    const offerIds = Array.from(
      new Set((data || []).map((m) => m.offer_id).filter((id): id is string => !!id)),
    )
    const offerMap = new Map<string, { id: string; offer_number: string; title: string }>()
    if (offerIds.length > 0) {
      const { data: offers } = await admin
        .from('offers')
        .select('id, offer_number, title')
        .in('id', offerIds)
        // Q10: kun kundens egne tilbud — en besked med et fremmed offer_id viste ellers det tilbuds nr./titel
        .eq('customer_id', customerId)
      for (const o of offers || []) {
        offerMap.set(o.id as string, {
          id: o.id as string,
          offer_number: (o.offer_number as string) || '',
          title: (o.title as string) || '',
        })
      }
    }

    const enriched = (data || []).map((m) => ({
      ...m,
      offer: m.offer_id ? offerMap.get(m.offer_id) || null : null,
    }))

    // Kommunikations-review 2026-10-09 (#1): friske links (de gemte udløb efter 1 time)
    const { withFreshChatAttachmentUrls } = await import('@/lib/portal/chat-attachment-links')
    return { success: true, data: (await withFreshChatAttachmentUrls(enriched, customerId)) as PortalMessageWithRelations[] }
  } catch (error) {
    logger.error('Error in getPortalMessages', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Send message from portal (customer)
/**
 * Portal-grænser (Henrik 2026-10-07, R-PRT-B): kundeportalen er uden login — én tokenholder kunne ellers fylde
 * portal_messages, storage og kontakt@ uden loft. Pr. kunde (rullende vinduer).
 */
const PORTAL_MESSAGE_MAX_CHARS = 5000
const PORTAL_MESSAGE_MAX_ATTACHMENTS = 10
const PORTAL_MESSAGES_PER_HOUR = 20
const PORTAL_UPLOADS_PER_DAY = 20
const PORTAL_NOTIFY_MIN_INTERVAL_MS = 10 * 60_000

export async function sendPortalMessage(
  token: string,
  data: SendPortalMessageData
): Promise<ActionResult<PortalMessage>> {
  try {
    // Validate token first (eksisterende anon-flow indtil Phase alpha.2)
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const customerId = sessionResult.data.customer_id

    // App-lag-guard: customer_id i payload SKAL matche session — beskytter
    // mod cross-customer-injection selvom service-role bypasser RLS.
    if (data.customer_id !== customerId) {
      return { success: false, error: 'Ugyldig kunde' }
    }

    // Phase alpha.1: portal_messages anon-INSERT-policy droppet. Brug
    // service-role server-side. customer_id-match haandhaeves i app-lag
    // (linje ovenfor) — service-role har INGEN RLS-guard, saa app er
    // single source of truth for scope.
    const admin = createAdminClient()
    // Portal-grænser: længde, antal vedhæftninger og beskeder pr. time pr. kunde
    if (typeof data.message !== 'string' || data.message.length > PORTAL_MESSAGE_MAX_CHARS) {
      return { success: false, error: `Beskeden er for lang (højst ${PORTAL_MESSAGE_MAX_CHARS.toLocaleString('da-DK')} tegn)` }
    }
    if ((data.attachments ?? []).length > PORTAL_MESSAGE_MAX_ATTACHMENTS) {
      return { success: false, error: `Højst ${PORTAL_MESSAGE_MAX_ATTACHMENTS} vedhæftninger pr. besked` }
    }
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const { count: lastHour } = await admin.from('portal_messages').select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId).eq('sender_type', 'customer').gte('created_at', hourAgo)
    if ((lastHour ?? 0) >= PORTAL_MESSAGES_PER_HOUR) {
      return { success: false, error: 'Du har sendt mange beskeder på kort tid — prøv igen om lidt, eller ring til os' }
    }
    // Notifikationsmail højst hver 10. min. pr. kunde (beskeden gemmes altid)
    const { data: lastMsg } = await admin.from('portal_messages').select('created_at')
      .eq('customer_id', customerId).eq('sender_type', 'customer').order('created_at', { ascending: false }).limit(1).maybeSingle()
    const notifyStaff = !lastMsg || Date.now() - new Date((lastMsg as { created_at: string }).created_at).getTime() >= PORTAL_NOTIFY_MIN_INTERVAL_MS
    // Q10: vedhæftninger skal være kundens egne uploads (signeret URL i portal-attachments/<kunde>/) — før blev
    // klientens URL gemt som den var og vist som link/billede for medarbejderen (vilkårligt eksternt link)
    const ownPrefix = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')}/storage/v1/object/sign/portal-attachments/${customerId}/`
    if ((data.attachments ?? []).some((a) => typeof a?.url !== 'string' || !a.url.startsWith(ownPrefix))) {
      return { success: false, error: 'Ugyldig vedhæftning' }
    }
    // Q10: offer_id skal være kundens eget tilbud (før blev et vilkårligt UUID gemt og slået op uden kunde-filter)
    if (data.offer_id) {
      const { data: own } = await admin.from('offers').select('id').eq('id', data.offer_id).eq('customer_id', customerId).maybeSingle()
      if (!own) return { success: false, error: 'Ugyldigt tilbud' }
    }
    // Kommunikations-review 2026-10-09 (#7): afsendernavnet kommer fra kunden selv (token), aldrig fra klienten — ellers
    // kunne en tokenholder skrive som "Elta Solar – Henrik" eller gemme vilkårligt lange navne
    const senderName = sessionResult.data.customer.contact_person || sessionResult.data.customer.company_name || 'Kunde'
    const { data: message, error } = await admin
      .from('portal_messages')
      .insert({
        customer_id: customerId,
        offer_id: data.offer_id || null,
        sender_type: 'customer',
        sender_name: senderName,
        message: data.message,
        attachments: data.attachments || [],
      })
      .select()
      .single()

    if (error) {
      logger.error('Error sending portal message', { error: error })
      return { success: false, error: 'Kunne ikke sende besked' }
    }

    // Send email notification to CRM mailbox (non-critical) — højst hver 10. min. pr. kunde
    if (notifyStaff) try {
      const crmMailbox = process.env.GRAPH_MAILBOX || 'kontakt@eltasolar.dk'
      const companyName = sessionResult.data.customer.company_name || 'Kunde'
      const contactPerson = sessionResult.data.customer.contact_person || 'Kunde'
      const subject = `Ny besked fra ${contactPerson} (${companyName})`
      const html = `
        <h2>Ny besked fra kundeportalen</h2>
        <p><strong>${escapeHtml(contactPerson)}</strong> fra <strong>${escapeHtml(companyName)}</strong> har sendt en besked:</p>
        <blockquote style="border-left:4px solid #2D8A2D;padding:12px 16px;margin:16px 0;background:#f8f9fa;color:#374151;">
          ${escapeHtmlWithLineBreaks(data.message)}
        </blockquote>
        ${data.attachments && data.attachments.length > 0 ? `<p style="color:#666;">Vedhæftede filer: ${data.attachments.length}</p>` : ''}
        <p>Svar kunden i ELTA Drift: <a href="${(process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app').trim()}/dashboard/customers">Gå til Kunder</a></p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
        <p style="color:#999;font-size:12px;">Denne email er automatisk genereret af ELTA Drift.</p>
      `
      const text = `Ny besked fra ${contactPerson} (${companyName}):\n\n${data.message}\n\nSvar kunden i ELTA Drift.`

      if (isGraphConfigured()) {
        // Sprint 8H Phase 3: central mail-router (internal_notification).
        const { resolveInternalNotificationRoute, logMailRoute } = await import(
          '@/lib/actions/mail-route-resolvers'
        )
        const routeResult = await resolveInternalNotificationRoute({
          recipientEmail: crmMailbox,
          customerId,
          contextLabel: `portal_message:${customerId}`,
        })
        if (routeResult.ok && routeResult.route) {
          const route = routeResult.route
          const sendResult = await sendEmailViaGraph({
            to: route.toEmail,
            subject,
            html,
            text,
          })
          await logMailRoute(
            route,
            sendResult.success ? 'sent' : 'failed',
            { customer_id: customerId, error: sendResult.error }
          )
        }
      } else {
        await sendEmail({ to: crmMailbox, subject, html, text })
      }
    } catch (emailError) {
      logger.error('Failed to send portal message notification', { error: emailError })
    }

    return { success: true, data: message as PortalMessage }
  } catch (error) {
    logger.error('Error in sendPortalMessage', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Send message from employee to customer
export async function sendEmployeeMessage(
  customerId: string,
  message: string,
  offerId?: string,
  attachments?: PortalAttachment[]
): Promise<ActionResult<PortalMessage>> {
  try {
    // Kommunikations-review 2026-10-09 (#5): skrive til kunden kræver kunderelationen (customers.edit — samme som at
    // markere læst); montør/bogholderi kunne ellers skrive i enhver kundes chat (og udløse mail til kunden). Længdeloft
    // som portalens 5000 tegn.
    const { supabase, userId } = await requireGate('customers.edit')
    if (!/^[0-9a-f-]{36}$/i.test(customerId)) return { success: false, error: 'Ugyldig kunde' }
    if ((!message || !message.trim()) && !(attachments && attachments.length)) return { success: false, error: 'Beskeden er tom' }
    if ((message ?? '').length > 5000) return { success: false, error: 'Beskeden er for lang (højst 5000 tegn)' }
    // Mail-review 2026-10-08 (#8): offerId blev aldrig tjekket — en besked kunne knyttes til en anden kundes tilbud
    if (offerId) {
      const { data: own } = await supabase.from('offers').select('id').eq('id', offerId).eq('customer_id', customerId).maybeSingle()
      if (!own) return { success: false, error: 'Tilbuddet hører ikke til kunden' }
    }

    // Get employee name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()

    const { data: messageData, error } = await supabase
      .from('portal_messages')
      .insert({
        customer_id: customerId,
        offer_id: offerId || null,
        sender_type: 'employee',
        sender_id: userId,
        sender_name: profile?.full_name || 'Medarbejder',
        message,
        attachments: attachments || [],
      })
      .select()
      .single()

    if (error) {
      logger.error('Error sending employee message', { error: error })
      return { success: false, error: 'Kunne ikke sende besked' }
    }

    // R3 — Notify customer by email that there is a new portal message.
    // Non-critical: never block message creation. Mail body intentionally
    // does NOT include the message text — customer must log in to read.
    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('company_name, contact_person, email')
        .eq('id', customerId)
        .maybeSingle()

      const recipientEmail = customer?.email?.trim() || null

      if (!recipientEmail) {
        logger.info('Portal message notification skipped: customer has no email', {
          action: 'portal_message_email_notification',
          entity: 'customers',
          entityId: customerId,
          metadata: { outcome: 'skipped', reason: 'no_customer_email' },
        })
      } else if (isInternalEmail(recipientEmail)) {
        logger.info('Portal message notification skipped: internal recipient', {
          action: 'portal_message_email_notification',
          entity: 'customers',
          entityId: customerId,
          metadata: { outcome: 'skipped', reason: 'internal_email', to: recipientEmail },
        })
      } else {
        // Find newest active, non-expired portal_access_token for deep-link.
        const nowIso = new Date().toISOString()
        const { data: tokenRow } = await (await secretTokenReader())
          .from('portal_access_tokens')
          .select('token, expires_at')
          .eq('customer_id', customerId)
          .eq('is_active', true)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!tokenRow?.token) {
          logger.info('Portal message notification skipped: no active portal token', {
            action: 'portal_message_email_notification',
            entity: 'customers',
            entityId: customerId,
            metadata: { outcome: 'skipped', reason: 'no_active_token' },
          })
        } else {
          const portalUrl = offerId
            ? `${APP_URL}/portal/${tokenRow.token}/offers/${offerId}`
            : `${APP_URL}/portal/${tokenRow.token}`

          const greetingName =
            customer?.contact_person?.trim() ||
            customer?.company_name?.trim() ||
            'Kunde'

          const subject = 'Ny besked fra Elta Solar'

          const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #2D8A2D; padding: 24px 32px; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 20px;">Ny besked fra Elta Solar</h1>
              </div>
              <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p style="font-size: 16px; color: #111827;">Kære ${escapeHtml(greetingName)},</p>
                <p style="color: #374151;">Du har en ny besked fra Elta Solar i kundeportalen.</p>
                <p style="color: #374151;">Klik på knappen herunder for at åbne portalen og læse beskeden.</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                  <tr>
                    <td align="center">
                      <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#2D8A2D;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
                        Åbn kundeportalen
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="color: #374151; margin-top: 24px;">Med venlig hilsen,<br/><strong>Elta Solar</strong></p>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
                <p style="color:#999;font-size:12px;">Denne email er automatisk genereret af Elta Solar. Selve beskeden vises kun i kundeportalen.</p>
              </div>
            </div>
          `
          const text = `Kære ${greetingName},\n\nDu har en ny besked fra Elta Solar i kundeportalen.\n\nÅbn portalen her: ${portalUrl}\n\nMed venlig hilsen,\nElta Solar`

          let mailOk = false
          let mailError: string | undefined

          if (isGraphConfigured()) {
            const sendResult = await sendEmailViaGraph({
              to: recipientEmail,
              subject,
              html,
              text,
            })
            mailOk = sendResult.success
            mailError = sendResult.error
          } else {
            const smtp = await readSmtpSettingsServerOnly()
            const smtpConfig = smtp
              ? {
                  host: smtp.host || undefined,
                  port: smtp.port || undefined,
                  user: smtp.user || undefined,
                  password: smtp.password || undefined,
                  fromEmail: smtp.fromEmail || undefined,
                  fromName: smtp.fromName || undefined,
                }
              : undefined
            const sendResult = await sendEmail(
              { to: recipientEmail, subject, html, text },
              smtpConfig
            )
            mailOk = sendResult.success
            mailError = sendResult.error
          }

          if (mailOk) {
            logger.info('Portal message notification sent', {
              action: 'portal_message_email_notification',
              entity: 'customers',
              entityId: customerId,
              metadata: {
                outcome: 'sent',
                to: recipientEmail,
                via: isGraphConfigured() ? 'graph' : 'smtp',
                has_offer_link: !!offerId,
              },
            })
          } else {
            logger.error('Portal message notification failed', {
              action: 'portal_message_email_notification',
              entity: 'customers',
              entityId: customerId,
              metadata: {
                outcome: 'failed',
                to: recipientEmail,
                via: isGraphConfigured() ? 'graph' : 'smtp',
                error: mailError,
              },
            })
          }
        }
      }
    } catch (notifyError) {
      logger.error('Portal message notification threw', {
        action: 'portal_message_email_notification',
        entity: 'customers',
        entityId: customerId,
        error: notifyError,
      })
      // Non-critical — message is saved, mail is best-effort.
    }

    revalidatePath('/customers')
    revalidatePath('/offers')
    return { success: true, data: messageData as PortalMessage }
  } catch (error) {
    logger.error('Error in sendEmployeeMessage', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Mark portal messages as read
export async function markPortalMessagesAsRead(
  token: string,
  messageIds: string[]
): Promise<ActionResult> {
  try {
    // Validate token first
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return { success: true }
    }

    // Phase α.3 trin 3: anon-UPDATE-policy paa portal_messages droppet
    // i 00130. Bruger nu admin-client + eksplicit customer_id-scope, saa
    // kunde A aldrig kan markere kunde B's beskeder som laest.
    //
    // Den gamle anon-policy havde KUN sender_type='employee'-tjek, ikke
    // customer_id-tjek — en kunde kunne med vilkaarlige message-IDs
    // markere andres beskeder. Service-role har ingen RLS-guard, saa
    // app-laget er nu single source of truth for scope.
    const admin = createAdminClient()
    const customerId = sessionResult.data.customer_id

    const { error } = await admin
      .from('portal_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', messageIds)
      .eq('sender_type', 'employee')
      .eq('customer_id', customerId)

    if (error) {
      logger.error('Error marking messages as read', { error: error })
      return { success: false, error: 'Kunne ikke markere som læst' }
    }

    return { success: true }
  } catch (error) {
    logger.error('Error in markPortalMessagesAsRead', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get unread message count for employee view
export async function getUnreadPortalMessageCount(
  customerId?: string,
  offerId?: string
): Promise<ActionResult<number>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    let query = supabase
      .from('portal_messages')
      .select('*', { count: 'exact', head: true })
      .eq('sender_type', 'customer')
      .is('read_at', null)

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    // Sprint 12C hotfix — when offerId is set, restrict to messages for
    // this offer OR with no offer link (kunde skrev fra portal-home).
    // Matches getCustomerPortalMessages so badge cannot show messages
    // that the chat content excludes.
    if (offerId) {
      query = query.or(`offer_id.eq.${offerId},offer_id.is.null`)
    }

    const { count, error } = await query

    if (error) {
      logger.error('Error fetching unread count', { error: error })
      return { success: false, error: 'Kunne ikke hente antal ulæste' }
    }

    return { success: true, data: count || 0 }
  } catch (error) {
    logger.error('Error in getUnreadPortalMessageCount', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/** Højst så mange (nyeste) chatbeskeder hentes pr. visning. */
const CHAT_HISTORY_LIMIT = 500

// Get messages for a customer (employee view)
export async function getCustomerPortalMessages(
  customerId: string,
  offerId?: string
): Promise<ActionResult<PortalMessageWithRelations[]>> {
  try {
    // Kommunikations-review 2026-10-09 (#8): gate (før kun login) + UUID-validering (offerId gik ufiltreret i .or())
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('customers.view')) return { success: false, error: 'Manglende tilladelse: customers.view' }
    if (!/^[0-9a-f-]{36}$/i.test(customerId) || (offerId && !/^[0-9a-f-]{36}$/i.test(offerId))) {
      return { success: false, error: 'Ugyldigt id' }
    }

    let query = supabase
      .from('portal_messages')
      .select('*')
      .eq('customer_id', customerId)
      // Kommunikations-review 2026-10-09 (#6): nyeste først med grænse, vendes efter hentning
      .order('created_at', { ascending: false })
      .limit(CHAT_HISTORY_LIMIT)

    // Sprint 12C hotfix — match getUnreadPortalMessageCount: when offerId
    // is set, include messages for this offer OR with no offer link
    // (kunde skrev fra portal-home). Mirrors getPublicOfferMessages.
    if (offerId) {
      query = query.or(`offer_id.eq.${offerId},offer_id.is.null`)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Error fetching customer portal messages', { error })
      return { success: false, error: 'Kunne ikke hente beskeder' }
    }

    const { withFreshChatAttachmentUrls } = await import('@/lib/portal/chat-attachment-links')
    const chronological = (data || []).slice().reverse()
    return { success: true, data: (await withFreshChatAttachmentUrls(chronological, customerId)) as PortalMessageWithRelations[] }
  } catch (error) {
    logger.error('Error in getCustomerPortalMessages', { error })
    return { success: false, error: 'Kunne ikke hente beskeder' }
  }
}

// Mark customer messages as read (employee view)
export async function markCustomerMessagesAsRead(
  messageIds: string[]
): Promise<ActionResult> {
  try {
    // Kode-review: kun roller der arbejder med kundens sag (customers.edit — samme som cockpittets kort); montør/bogholderi
    // (customers.view) må ikke kunne fjerne beskeder fra sælgernes kø
    const ctx = await requireGate('customers.edit')
    const requested = (messageIds || []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500)
    if (requested.length === 0) return { success: true }
    // Kun beskeder brugeren selv kan se (RLS via brugerens klient) — service-role-opdateringen nedenfor omgår RLS
    const { data: visible } = await ctx.supabase.from('portal_messages').select('id').in('id', requested)
    const ids = ((visible ?? []) as Array<{ id: string }>).map((m) => m.id)
    if (ids.length === 0) return { success: true }

    // N50-fix: RLS' UPDATE-policy tillader kun medarbejderen at rette SINE EGNE beskeder → markering af kundens
    // beskeder ramte 0 rækker uden fejl, og alle kundebeskeder stod som ulæste for altid (prod: 8/8, ældste 199 d).
    // Efter app-gaten skrives KUN read_at, KUN på kundebeskeder, KUN de valgte id'er (service-role).
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('portal_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)
      .eq('sender_type', 'customer')
      .is('read_at', null)

    if (error) {
      logger.error('Error marking customer messages as read', { error: error })
      return { success: false, error: 'Kunne ikke markere som læst' }
    }

    return { success: true }
  } catch (error) {
    logger.error('Error in markCustomerMessagesAsRead', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal File Attachments
// =====================================================

/**
 * Upload a file attachment for portal chat (customer)
 */
export async function uploadPortalAttachment(
  token: string,
  formData: FormData
): Promise<ActionResult<UploadAttachmentResult>> {
  try {
    // Validate token
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const customerId = sessionResult.data.customer_id
    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'Ingen fil valgt' }
    }

    // Validate file size (10MB max)
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'Filen er for stor (max 10MB)' }
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ]

    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Filtypen er ikke tilladt' }
    }

    // Phase β.1: portal-attachments anon-policies droppes i migration 00132.
    // Path konstrueres server-side ud fra session.customer_id (kunden kan
    // ikke styre folder via input). Bruger admin-client til upload +
    // signed-URL — service-role har INGEN RLS-guard, saa app er single
    // source of truth for scope.
    const supabase = createAdminClient()

    // Portal-grænse: højst PORTAL_UPLOADS_PER_DAY uploads pr. kunde pr. døgn (filerne ligger i <kunde>/<tidsstempel>-…)
    const { data: recent } = await supabase.storage.from('portal-attachments')
      .list(customerId, { limit: PORTAL_UPLOADS_PER_DAY + 1, sortBy: { column: 'created_at', order: 'desc' } })
    const dayAgo = Date.now() - 86_400_000
    const uploadsToday = (recent ?? []).filter((f) => f.created_at && new Date(f.created_at).getTime() >= dayAgo).length
    if (uploadsToday >= PORTAL_UPLOADS_PER_DAY) {
      return { success: false, error: 'Du har uploadet mange filer i dag — prøv igen i morgen, eller send dem på mail' }
    }

    // Generate unique filename (path er kunde-scoped via session.customer_id)
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const path = `${customerId}/${timestamp}-${sanitizedName}`

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('portal-attachments')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      logger.error('Error uploading file', { error: uploadError })
      return { success: false, error: 'Kunne ikke uploade fil' }
    }

    // Get signed URL (valid for 1 hour)
    const { data: urlData } = await supabase.storage
      .from('portal-attachments')
      .createSignedUrl(path, 3600)

    return {
      success: true,
      data: {
        path: uploadData.path,
        url: urlData?.signedUrl || '',
        name: file.name,
        size: file.size,
        type: file.type,
      },
    }
  } catch (error) {
    logger.error('Error in uploadPortalAttachment', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Upload a file attachment for portal chat (employee)
 */
export async function uploadEmployeeAttachment(
  customerId: string,
  formData: FormData
): Promise<ActionResult<UploadAttachmentResult>> {
  try {
    const { userId } = await requireGate('customers.edit')
    // Kommunikations-review 2026-10-09 (#3): fil-adgang via service-klienten bag gaten — 00209 (prod) fjernede
    // medarbejdernes direkte storage-politikker, så upload med bruger-sessionen fejlede. customers.edit (#5) som
    // markCustomerMessagesAsRead; gyldig kunde-id (stien bygges af den)
    if (!/^[0-9a-f-]{36}$/i.test(customerId)) return { success: false, error: 'Ugyldig kunde' }
    const supabase = createAdminClient()

    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'Ingen fil valgt' }
    }

    // Validate file size (10MB max)
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'Filen er for stor (max 10MB)' }
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ]

    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Filtypen er ikke tilladt' }
    }

    // Generate unique filename
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const path = `${customerId}/${userId}-${timestamp}-${sanitizedName}`

    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('portal-attachments')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      logger.error('Error uploading file', { error: uploadError })
      return { success: false, error: 'Kunne ikke uploade fil' }
    }

    // Get signed URL (valid for 1 hour)
    const { data: urlData } = await supabase.storage
      .from('portal-attachments')
      .createSignedUrl(path, 3600)

    return {
      success: true,
      data: {
        path: uploadData.path,
        url: urlData?.signedUrl || '',
        name: file.name,
        size: file.size,
        type: file.type,
      },
    }
  } catch (error) {
    logger.error('Error in uploadEmployeeAttachment', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Get a fresh signed URL for a portal attachment.
 *
 * Phase β.1: signaturen kraever nu `token` saa vi kan validere session,
 * og pathen skal starte med `${session.customer_id}/` — saa kunde A
 * aldrig kan anmode om signed URL til kunde B's fil. Service-role
 * bruges til selve signedUrl-kaldet (admin-client).
 */
export async function getAttachmentUrl(
  token: string,
  path: string
): Promise<ActionResult<string>> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const customerId = sessionResult.data.customer_id

    // Path skal vaere kunde-scoped: ${customerId}/...
    // Vi tjekker for praefikset eksakt — accepterer kun forward slash
    // som separator (Supabase storage bruger '/') og afviser path-
    // traversal-forsoeg.
    if (typeof path !== 'string' || !path.startsWith(`${customerId}/`) || path.includes('..')) {
      return { success: false, error: 'Ugyldig fil-sti' }
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase.storage
      .from('portal-attachments')
      .createSignedUrl(path, 3600) // 1 hour

    if (error) {
      logger.error('Error getting signed URL', { error: error })
      return { success: false, error: 'Kunne ikke hente fil-URL' }
    }

    return { success: true, data: data.signedUrl }
  } catch (error) {
    logger.error('Error in getAttachmentUrl', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal Invoices
// =====================================================

// Get invoices visible to portal customer (cost-free, kunde-scoped).
//
// Sikkerhed (jf. plan-invarianter):
//   - validatePortalToken først; customer_id stammer fra valideret token
//   - admin-client + eksplicit .eq('customer_id', customerId) = grænsen
//   - KUN salgs-/fakturatal i SELECT — ALDRIG kost/margin/dækningsbidrag.
//     Interne kolonner (notes, payment_reference, reminder_*, external_*,
//     work_order_id, voided_by, credit_reason, amount_basis*, parts-FK'er)
//     udelades bevidst.
//   - Synlighed: kun status sent/paid og IKKE annulleret (voided_at IS NULL)
//     — drafts er internt WIP, voided er misvisende uden kontekst.
export async function getPortalInvoices(
  token: string
): Promise<ActionResult<PortalInvoice[]>> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const supabase = createAdminClient()
    const customerId = sessionResult.data.customer_id

    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, payment_status, invoice_type, total_amount, tax_amount, final_amount, amount_paid, currency, due_date, sent_at, paid_at, created_at')
      .eq('customer_id', customerId)
      .in('status', ['sent', 'paid'])
      .is('voided_at', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      logger.error('Error fetching portal invoices', { error })
      return { success: false, error: 'Kunne ikke hente fakturaer' }
    }

    const invoices: PortalInvoice[] = (data || []).map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      status: inv.status,
      payment_status: inv.payment_status,
      invoice_type: inv.invoice_type ?? 'standard',
      total_amount: inv.total_amount,
      tax_amount: inv.tax_amount,
      final_amount: inv.final_amount,
      amount_paid: inv.amount_paid,
      currency: inv.currency,
      due_date: inv.due_date,
      sent_at: inv.sent_at,
      paid_at: inv.paid_at,
      created_at: inv.created_at,
      is_credit_note: inv.invoice_type === 'credit',
    }))

    return { success: true, data: invoices }
  } catch (error) {
    logger.error('Error in getPortalInvoices', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal Documents
// =====================================================

export interface PortalDocument {
  id: string
  title: string
  description: string | null
  document_type: string
  file_url: string
  file_name: string
  mime_type: string
  created_at: string
}

// Get documents visible to portal customer
export async function getPortalDocuments(
  token: string
): Promise<ActionResult<PortalDocument[]>> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    // Phase alpha.1: customer_documents anon-SELECT-policy droppet.
    // Brug service-role server-side, scoped til session.customer_id.
    const admin = createAdminClient()
    const customerId = sessionResult.data.customer_id

    const { data, error } = await admin
      .from('customer_documents')
      .select('id, title, description, document_type, file_url, storage_path, file_name, mime_type, created_at')
      .eq('customer_id', customerId)
      // Kommunikations-review (S1): mail-vedhæftninger arkiveres automatisk på kunden ("Download" i mailen) — også fra
      // leverandørmails (ordrebekræftelser, kostpriser), der er koblet til kunden. De er INTERNE og vises ikke i portalen.
      .is('source_email_id', null)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching portal documents', { error })
      return { success: false, error: 'Kunne ikke hente dokumenter' }
    }

    // S1 (portal-review 2026-10-07): fuldmagter vises KUN i fuldmagt-sektionen (getPortalFuldmagter, med
    // underskriver-tjek). Her lå den underskrevne fuldmagt-PDF (CPR + underskrift) også — på kortet, hvor den blev
    // oprettet, ofte betalerens/partnerens, ikke anlægsejerens.
    const visible = (data ?? []).filter((d) => !isFuldmagtDocument(d as { document_type: string | null; description: string | null }))

    // Phase β.2.3: lazy-refresh file_url via signed-URL helper for hver
    // row der har storage_path. Sikrer at portalen virker baade foer og
    // efter bucket-privatisering (β.2.5). TTL=SHORT (1t) — portal-siden
    // re-loader ofte og kort levetid er mest sikkert.
    // Storage-review 2026-10-08 (#7): kun stier i kundens egne mapper (eller tilbuds-PDF'er) signeres — en dokumentrække
    // hvis storage_path peger andre steder hen (fx leverandørfakturaer/en anden kundes mappe) udleveres ikke
    const ownPath = (p: string) => !p.includes('..') && (p.startsWith(`customer-documents/${customerId}/`)
      || p.startsWith(`outbound-attachments/${customerId}/`) || /^quotes\/\d{4}\/[^/]+\.pdf$/i.test(p))
    const paths = visible.map((d) => { const p = (d.storage_path as string | null) ?? ''; return ownPath(p) ? p : '' })
    const { getStorageSignedUrls, SIGNED_URL_TTL: TTL } = await import('@/lib/storage/signed-url')
    const fresh = await getStorageSignedUrls(
      'attachments',
      paths.filter((p) => p),
      TTL.SHORT,
    )
    const freshByIdx: Record<number, string | null> = {}
    let fIdx = 0
    for (let i = 0; i < paths.length; i++) {
      if (paths[i]) { freshByIdx[i] = fresh[fIdx]; fIdx++ }
    }

    // Phase 9I: aldrig laek raw description-JSON til portal-klient. Sanitize
    // her ogsaa selvom UI ogsaa filtrerer — defense in depth.
    const { getSafeDocumentDescription } = await import('@/lib/documents/display-description')
    const curated = visible.map((d, idx) => ({
      ...d,
      // ingen fallback til et gemt (evt. 1-årigt) link når stien ikke er kundens egen
      file_url: freshByIdx[idx] ?? (paths[idx] || !d.storage_path ? d.file_url ?? '' : ''),
      description: getSafeDocumentDescription(d),
    }))

    return { success: true, data: curated as PortalDocument[] }
  } catch (error) {
    logger.error('Error in getPortalDocuments', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Portal Besigtigelse Booking
// =====================================================

export interface PortalBesigtigelse {
  id: string
  customer_id: string
  title: string
  description: string | null
  due_date: string
  status: string
  created_at: string
}

/**
 * Book a besigtigelse from the customer portal (no auth required — uses token).
 */
export async function portalBookBesigtigelse(
  token: string,
  date: string,
  timeSlot: string,
  notes?: string
): Promise<ActionResult<{ taskId: string }>> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const session = sessionResult.data

    // N31: offentligt endpoint (kun token) — valider input og begræns åbne bookinger
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date())
    const maxDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() + 180 * 86_400_000))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > maxDate) {
      return { success: false, error: 'Vælg en dato fra i dag og op til et halvt år frem' }
    }
    const slot = (timeSlot ?? '').trim()
    if (!slot || slot.length > 40) return { success: false, error: 'Vælg et tidsrum' }
    timeSlot = slot
    notes = notes?.trim().slice(0, 1000) || undefined

    // Phase alpha.1: customer_tasks anon FOR ALL-policy droppet. Brug
    // service-role server-side til baade customer-lookup og task-insert,
    // scoped til session.customer_id fra valideret token.
    const admin = createAdminClient()

    const { count: openBookings } = await admin
      .from('customer_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', session.customer_id)
      .ilike('title', 'PORTAL: Besigtigelse%')
      .neq('status', 'done')
    if ((openBookings ?? 0) >= 3) {
      return { success: false, error: 'Du har allerede åbne bookinger — vi kontakter dig snarest' }
    }

    const formattedDate = new Date(date).toLocaleDateString('da-DK', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

    // Fetch customer address for ICS location
    const { data: customer } = await admin
      .from('customers')
      .select('billing_address, billing_city, billing_postal_code, shipping_address, shipping_city, shipping_postal_code')
      .eq('id', session.customer_id)
      .single()

    const address = customer?.shipping_address || customer?.billing_address || ''
    const city = customer?.shipping_city || customer?.billing_city || ''
    const postal = customer?.shipping_postal_code || customer?.billing_postal_code || ''
    const fullAddress = [address, `${postal} ${city}`.trim()].filter(Boolean).join(', ')

    const portalUrl = `${APP_URL}/portal/${token}`

    const description = [
      `PORTAL-BOOKING: Besigtigelse anmodet af kunden via portalen.`,
      `Dato: ${formattedDate}`,
      `Tidspunkt: ${timeSlot}`,
      fullAddress ? `Adresse: ${fullAddress}` : null,
      notes ? `Kundens besked: ${notes}` : null,
    ].filter(Boolean).join('\n')

    // Create task in CRM (service-role; scope haandhaeves i app-lag via session.customer_id)
    const { data: task, error: taskError } = await admin
      .from('customer_tasks')
      .insert({
        customer_id: session.customer_id,
        title: `PORTAL: Besigtigelse anmodet — ${session.customer.company_name}`,
        description,
        status: 'pending',
        priority: 'high',
        due_date: date,
        // N31: created_by refererer auth.users — kunden er ikke en bruger (før: customer_id → FK-fejl, booking fejlede altid)
        created_by: null,
      })
      .select('id')
      .single()

    if (taskError) {
      logger.error('Portal besigtigelse: failed to create task', { error: taskError })
      return { success: false, error: 'Kunne ikke oprette booking' }
    }

    // Send confirmation email with ICS attachment — N31: LIVE KUNDEMAIL er gated (Henrik 2026-10-03). Uden flaget
    // oprettes kun CRM-opgaven; kunden ser bookingen i portalen.
    if (process.env.PORTAL_BOOKING_CONFIRMATION_EMAIL_ENABLED !== 'true') {
      return { success: true, data: { taskId: task.id } }
    }
    try {
      const { sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
      const { generateBesigtigelseICS, extractStartTimeFromSlot } = await import('@/lib/utils/ics')

      const icsContent = generateBesigtigelseICS({
        title: 'Besigtigelse: Elta Solar',
        location: fullAddress || undefined,
        description: `Vi glæder os til at se dig. Du kan altid finde dine dokumenter og detaljer her: ${portalUrl}`,
        startDate: date,
        startTime: extractStartTimeFromSlot(timeSlot),
      })

      const emailHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e40af; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Besigtigelse — Bekræftelse</h1>
          </div>
          <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; color: #111827;">Kære ${escapeHtml(session.customer.contact_person)},</p>
            <p style="color: #374151;">Tak for din booking af besigtigelse. Vi har modtaget din anmodning:</p>
            <div style="background: #f0f9ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 4px 0; color: #1e40af;"><strong>Dato:</strong> ${formattedDate}</p>
              <p style="margin: 4px 0; color: #1e40af;"><strong>Tidspunkt:</strong> ${escapeHtml(timeSlot)}</p>
              ${fullAddress ? `<p style="margin: 4px 0; color: #1e40af;"><strong>Adresse:</strong> ${escapeHtml(fullAddress)}</p>` : ''}
              ${notes ? `<p style="margin: 4px 0; color: #1e40af;"><strong>Din besked:</strong> ${escapeHtmlWithLineBreaks(notes)}</p>` : ''}
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
              <tr>
                <td align="center">
                  <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#1e40af;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
                    Se din besigtigelse i kundeportalen
                  </a>
                </td>
              </tr>
            </table>
            <p style="color: #374151;">Vi vender tilbage med en endelig bekræftelse hurtigst muligt.</p>
            <p style="color: #374151; margin-top: 24px;">Med venlig hilsen,<br/><strong>Elta Solar</strong></p>
          </div>
        </div>
      `

      // Sprint 8H Phase 4: central mail-router (besigtigelse-intent).
      // Portal-flowet kender kun customer_id, saa routen falder tilbage
      // paa paying_customer (customer.email). Adfaerden bibeholdes.
      const { resolveBesigtigelseMailRoute, logMailRoute } = await import(
        '@/lib/actions/mail-route-resolvers'
      )
      const routeResult = await resolveBesigtigelseMailRoute(session.customer_id)
      if (routeResult.ok && routeResult.route) {
        const route = routeResult.route
        const sendResult = await sendEmailViaGraph({
          to: route.toEmail,
          subject: `Bekræftelse: Besigtigelse d. ${formattedDate}`,
          html: emailHtml,
          attachments: [
            {
              filename: 'besigtigelse.ics',
              content: Buffer.from(icsContent, 'utf-8'),
              contentType: 'text/calendar',
            },
          ],
        })
        await logMailRoute(
          route,
          sendResult.success ? 'sent' : 'failed',
          { task_id: task.id, source: 'portal_book_besigtigelse', error: sendResult.error }
        )
      } else {
        logger.error('Portal besigtigelse: route failed', {
          error: routeResult.error,
          entityId: session.customer_id,
        })
      }
    } catch (emailErr) {
      // Non-critical — task is created, email is a bonus
      logger.error('Portal besigtigelse: email failed', { error: emailErr })
    }

    return { success: true, data: { taskId: task.id } }
  } catch (error) {
    logger.error('Error in portalBookBesigtigelse', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Get existing besigtigelse bookings for portal customer — KUN opgaver med 'besigtigelse' i titel/beskrivelse
 * (D40: ingen fallback til øvrige, interne opgaver).
 */
/**
 * D40 + X4 (kommunikations-review 2026-10-07): kun en BOOKET, kundevendt besigtigelse ("Besigtigelse hos …", ingen
 * auto_rule) kan bekræftes/ombookes — før matchede alt med "besigtigelse" i titel/beskrivelse, også den interne
 * opstartsopgave "Planlæg besigtigelse eller montage" (lib/tasks/besigtigelse-task.ts).
 */
function isBesigtigelseTask(t: { title?: string | null; auto_rule?: string | null }): boolean {
  return isBookedCustomerBesigtigelse(t)
}

export async function getPortalBesigtigelser(
  token: string
): Promise<ActionResult<PortalBesigtigelse[]>> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const customerId = sessionResult.data.customer_id

    // Use admin client to bypass RLS — token already validated above so this is safe
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Query ALL tasks for this customer (no status filter — confirmed tasks should still show)
    const { data: allTasks, error: taskErr } = await supabase
      .from('customer_tasks')
      .select('id, customer_id, title, description, due_date, status, created_at, auto_rule')
      .eq('customer_id', customerId)
      // Planlægnings-review 2026-10-09 (#8): filtrér til besigtigelser FØR grænsen — kunder med mange opgaver
      // (auto-oprettede mailkunder) så ellers ikke deres nyeste booking. Endelig klassifikation sker nedenfor.
      .ilike('title', '%esigtigelse%')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(50)

    if (taskErr) {
      logger.error('Error fetching portal besigtigelser', { error: taskErr })
      return { success: false, error: 'Kunne ikke hente besigtigelser' }
    }

    const tasks = allTasks || []
    // Debug: log task count for portal

    // Prioritize tasks with "besigtigelse" in title/description
    // X4: bookede besigtigelser + kundens egne portal-anmodninger — aldrig interne opgaver med ordet i titlen
    const besigTasks = tasks.filter((t) => isBookedCustomerBesigtigelse(t) || isPortalBesigtigelseRequest(t))

    // D40 (S2): før faldt funktionen tilbage til ALLE kundens opgaver (interne titler/beskrivelser i kundeportalen —
    // prod 2026-10-03: 1 portalkunde, 2 interne opgaver). Nu kun besigtigelsesopgaver, og til klienten kun det
    // portalen viser: dato, status og tidspunkt-linjen (ingen interne titler/beskrivelser i payloaden).
    return {
      success: true,
      data: besigTasks.map((t) => {
        const time = t.description?.match(/Tidspunkt:\s*(.+)/i)?.[1] ?? t.description?.match(/kl\.\s*(\S+)/)?.[1] ?? null
        return { ...t, title: 'Besigtigelse', description: time ? `Tidspunkt: ${time.trim()}` : null } as PortalBesigtigelse
      }),
    }
  } catch (error) {
    logger.error('Error in getPortalBesigtigelser', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Customer confirms the proposed besigtigelse time via portal.
 * Updates the task status to 'in_progress' (= Bekræftet).
 * Sends a "Tak for bekræftelsen" email.
 */
export async function portalConfirmBesigtigelse(
  token: string,
  taskId: string
): Promise<ActionResult> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const session = sessionResult.data

    // Use admin client — token already validated, bypasses RLS issues with anon
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Verify task belongs to this customer and fetch full details
    const { data: task, error: fetchErr } = await supabase
      .from('customer_tasks')
      .select('id, customer_id, status, title, description, due_date, auto_rule')
      .eq('id', taskId)
      .eq('customer_id', session.customer_id)
      .single()

    // D40: kun besigtigelsesopgaver kan bekræftes fra portalen (ikke vilkårlige interne opgaver)
    if (fetchErr || !task || !isBesigtigelseTask(task as { title?: string | null; auto_rule?: string | null })) {
      return { success: false, error: 'Besigtigelse ikke fundet' }
    }
    // X4: allerede bekræftet/afsluttet → ingen ny statusændring, alarm eller mail (før genåbnet + mail ved hvert klik)
    if (task.status !== 'pending') return { success: true }

    // Extract time from description
    const timeMatch = task.description?.match(/Tidspunkt:\s*(.+)/i) || task.description?.match(/kl\.\s*(\S+)/)
    const timeSlot = timeMatch ? timeMatch[1].trim() : null

    const confirmDate = new Date().toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'long', year: 'numeric' })

    const updatedDesc = [
      task.description || '',
      `\n✓ BEKRÆFTET af kunden via portalen d. ${confirmDate}`,
    ].filter(Boolean).join('\n')

    const { data: confirmed, error: updateErr } = await supabase
      .from('customer_tasks')
      .update({
        status: 'in_progress',
        description: updatedDesc,
      })
      .eq('id', taskId)
      .eq('status', 'pending') // X4: kun én bekræftelse (samtidige klik)
      .select('id')

    if (updateErr) {
      logger.error('Portal confirm besigtigelse: update failed', { error: updateErr })
      return { success: false, error: 'Kunne ikke bekræfte besigtigelsen' }
    }
    if (!(confirmed ?? []).length) return { success: true }

    // Format date for email
    const formattedDate = task.due_date
      ? new Date(task.due_date).toLocaleDateString('da-DK', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null

    // Create system alert for notification bell
    try {
      const { createSystemAlertAdmin } = await import('@/lib/actions/system-alerts-admin')
      await createSystemAlertAdmin({
        alert_type: 'besigtigelse_confirmed',
        severity: 'info',
        title: 'Besigtigelse bekræftet',
        message: `${session.customer.contact_person} har bekræftet besigtigelsen${formattedDate ? ` d. ${formattedDate}` : ''}.`,
        details: { customer_id: session.customer_id, task_id: taskId },
        entity_type: 'customer',
        entity_id: session.customer_id,
      })
    } catch {
      // Non-critical
    }

    // Send "Tak for bekræftelsen" email
    try {
      const { sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
      // Sprint 8H Phase 4: central mail-router (besigtigelse-intent).
      const { resolveBesigtigelseMailRoute, logMailRoute } = await import(
        '@/lib/actions/mail-route-resolvers'
      )

      const portalUrl = `${APP_URL}/portal/${token}`

      const emailHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #166534; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Tak for din bekræftelse</h1>
          </div>
          <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; color: #111827;">Kære ${escapeHtml(session.customer.contact_person)},</p>
            <p style="color: #374151;">Tak for din bekræftelse af besigtigelsen. Vi ses som aftalt:</p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              ${formattedDate ? `<p style="margin: 4px 0; color: #166534;"><strong>Dato:</strong> ${formattedDate}</p>` : ''}
              ${timeSlot ? `<p style="margin: 4px 0; color: #166534;"><strong>Tidspunkt:</strong> ${escapeHtml(timeSlot)}</p>` : ''}
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
              <tr>
                <td align="center">
                  <a href="${portalUrl}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#1e40af;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
                    Se detaljer i kundeportalen
                  </a>
                </td>
              </tr>
            </table>
            <p style="color: #374151;">Har du spørgsmål er du velkommen til at kontakte os.</p>
            <p style="color: #374151; margin-top: 24px;">Med venlig hilsen,<br/><strong>Elta Solar</strong></p>
          </div>
        </div>
      `

      const subject = formattedDate
        ? `Tak for din bekræftelse — vi ses d. ${formattedDate}`
        : 'Tak for din bekræftelse af besigtigelsen'

      const routeResult = await resolveBesigtigelseMailRoute(session.customer_id)
      if (routeResult.ok && routeResult.route) {
        const route = routeResult.route
        const sendResult = await sendEmailViaGraph({
          to: route.toEmail,
          subject,
          html: emailHtml,
        })
        await logMailRoute(
          route,
          sendResult.success ? 'sent' : 'failed',
          { task_id: taskId, source: 'portal_confirm_besigtigelse', error: sendResult.error }
        )
      } else {
        logger.error('Portal confirm besigtigelse: route failed', {
          error: routeResult.error,
          entityId: session.customer_id,
        })
      }
    } catch (emailErr) {
      // Non-critical — confirmation is saved, email is a bonus
      logger.error('Portal confirm besigtigelse: email failed', { error: emailErr })
    }

    // Revalidate so Status & Flow updates
    revalidatePath(`/dashboard/customers/${session.customer_id}`)

    return { success: true }
  } catch (error) {
    logger.error('Error in portalConfirmBesigtigelse', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/**
 * Customer requests to reschedule a besigtigelse via portal.
 * Creates a new task in CRM with the customer's message.
 */
const PORTAL_RESCHEDULE_RULE = 'portal_reschedule'
const PORTAL_RESCHEDULE_MAX_PER_DAY = 3

export async function portalRequestReschedule(
  token: string,
  taskId: string,
  message: string
): Promise<ActionResult> {
  try {
    const sessionResult = await validatePortalToken(token)
    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: sessionResult.error }
    }

    const session = sessionResult.data

    // Q10: kundens tekst begrænses (før ubegrænset ind i en CRM-opgave)
    if (typeof message !== 'string' || message.length > 2000) {
      return { success: false, error: 'Beskeden er for lang (højst 2.000 tegn)' }
    }

    // Use admin client — token already validated
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Verify task belongs to this customer
    const { data: task, error: fetchErr } = await supabase
      .from('customer_tasks')
      .select('id, customer_id, due_date, title, description, assigned_to')
      .eq('id', taskId)
      .eq('customer_id', session.customer_id)
      .single()

    if (fetchErr || !task || !isBesigtigelseTask(task as { title?: string | null; auto_rule?: string | null })) {
      return { success: false, error: 'Besigtigelse ikke fundet' }
    }

    // Q10: højst PORTAL_RESCHEDULE_MAX_PER_DAY åbne anmodninger pr. kunde pr. døgn (før: ubegrænset → opgave-spam)
    const { count: recent } = await supabase
      .from('customer_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', session.customer_id)
      .eq('auto_rule', PORTAL_RESCHEDULE_RULE)
      .neq('status', 'done')
      .gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
    if ((recent ?? 0) >= PORTAL_RESCHEDULE_MAX_PER_DAY) {
      return { success: false, error: 'Vi har allerede modtaget din anmodning — vi kontakter dig hurtigst muligt' }
    }

    // Create a new task for the CRM user
    const { error: insertErr } = await supabase
      .from('customer_tasks')
      .insert({
        customer_id: session.customer_id,
        title: `KUNDE ØNSKER FLYTNING: ${session.customer.company_name}`,
        description: [
          `Kunden har anmodet om flytning af besigtigelse via portalen.`,
          `Nuværende dato: ${task.due_date || 'Ikke sat'}`,
          `Kundens besked: ${message}`,
        ].join('\n'),
        status: 'pending',
        priority: 'high',
        // created_by peger på auth.users — kundens id er ingen bruger → indsættelsen fejlede ALTID (FK), så kundens
        // anmodning nåede aldrig frem. Systemoprettet opgave; tildeles samme medarbejder som besigtigelsen.
        created_by: null,
        assigned_to: (task as { assigned_to?: string | null }).assigned_to ?? null,
        auto_generated: true,
        auto_rule: PORTAL_RESCHEDULE_RULE,
      })

    if (insertErr) {
      logger.error('Portal reschedule: task creation failed', { error: insertErr })
      return { success: false, error: 'Kunne ikke sende anmodningen' }
    }

    return { success: true }
  } catch (error) {
    logger.error('Error in portalRequestReschedule', { error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

/** Fallback-aktør når et tilbud mangler created_by: første aktive admin (samme regel som projektoprettelse). */
async function systemActorId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).order('created_at').limit(1).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** Sælgerkontakt til kundeportalen: navn, mail, telefon på tilbuddets opretter (aktiv profil). Ellers tom (UI viser "Sælger"). */
async function portalSalesPerson(admin: ReturnType<typeof createAdminClient>, profileId: string | null): Promise<{ full_name: string | null; email: string; phone: string | null }> {
  if (!profileId) return { full_name: null, email: '', phone: null }
  const { data } = await admin.from('profiles').select('full_name, email, phone, is_active').eq('id', profileId).maybeSingle()
  if (!data || data.is_active === false) return { full_name: null, email: '', phone: null }
  return { full_name: (data.full_name as string | null) ?? null, email: (data.email as string | null) ?? '', phone: (data.phone as string | null) ?? null }
}
