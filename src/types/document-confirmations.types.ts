/**
 * Phase B1 — types for document_confirmations.
 *
 * Bemaerk: 'expired' er IKKE en status-vaerdi i DB. Den beregnes ad-hoc
 * fra expires_at < NOW() AND status IN ('sent','opened'). Public-side
 * view-model har dog en 'expired' state for UI-routing.
 */

export type ConfirmationStatus =
  | 'pending'   // row oprettet, mail endnu ikke sendt
  | 'sent'      // mail leveret til Graph
  | 'failed'    // mail-send fejlede
  | 'opened'    // public side besoegt mindst én gang
  | 'confirmed' // modtager har bekraeftet
  | 'revoked'   // medarbejder har annulleret

export type ConfirmationRecipientType = 'customer' | 'contact' | 'manual'

export type ConfirmationRecipientRole =
  | 'orderer'
  | 'payer'
  | 'end_customer'
  | 'site_customer'
  | 'site_contact'
  | 'document_customer'
  | 'manual'

/**
 * State returnered til public confirm-side. 'expired' er afledt — ikke en
 * DB-status. 'invalid' bruges for ukendt token og for unormal/uventet
 * status (pending/failed naar public-side rammer den).
 */
export type PublicConfirmationState =
  | 'awaiting'
  | 'already_confirmed'
  | 'expired'
  | 'revoked'
  | 'invalid'

export const RECIPIENT_ROLE_LABELS: Record<ConfirmationRecipientRole, string> = {
  orderer: 'Ordregiver',
  payer: 'Betaler',
  end_customer: 'Anlægsejer',
  site_customer: 'Anlægsejer (leveringskunde)',
  site_contact: 'Kontaktperson på stedet',
  document_customer: 'Kunde på dokumentet',
  manual: 'Modtager',
}

// =====================================================
// Input — createConfirmationRequests
// =====================================================
export interface CreateConfirmationRecipient {
  recipientType: ConfirmationRecipientType
  customerId?: string | null
  contactId?: string | null
  email: string
  name?: string | null
  role: ConfirmationRecipientRole
}

export interface CreateConfirmationRequestsInput {
  documentId: string
  recipients: CreateConfirmationRecipient[]
  /** Default 30 dage hvis udeladt */
  expiresInDays?: number
  metadata?: Record<string, unknown>
  /**
   * Fase 2a — sekventiel kæde. Når true behandles `recipients` som en
   * ordnet kæde (trin 1 = anlægsejer/signer, trin 2 = betaler/partner …).
   * Hver row får metadata.sequence = { chainId, order, gated:true }. Kun
   * trin 1 mailes ved oprettelse; senere trin frigives manuelt af kontoret
   * efter forrige trins godkendelse (INGEN auto-send).
   */
  sequential?: boolean
}

/** Sekvens-info i document_confirmations.metadata.sequence (Fase 2a). */
export interface ConfirmationSequenceMeta {
  chainId: string
  order: number
  gated: boolean
}

/**
 * Returneres fra createConfirmationRequests. Token er kun synlig for den
 * authenticated medarbejder (eller server-side mail-template-byggeren).
 */
export interface CreatedConfirmation {
  confirmationId: string
  token: string
  recipientEmail: string
  recipientName: string | null
  recipientRole: ConfirmationRecipientRole
  expiresAt: string
}

// =====================================================
// Public view-model — getConfirmationContext
// =====================================================
/**
 * Curated view-model til public-siden. Indeholder kun de felter siden
 * behoever — aldrig raw DB-row. For state='invalid'/'expired'/'revoked'
 * returneres minimal info (ingen dokumenttitel, ingen PDF-link).
 */
export interface PublicConfirmationContext {
  state: PublicConfirmationState
  documentTitle: string
  documentFileName: string
  /** Kortlivet signed URL (1h). Kun sat for state='awaiting'|'already_confirmed'. */
  pdfUrl: string | null
  serviceCase: {
    caseNumber: string | null
    title: string | null
  } | null
  recipientRoleLabel: string
  recipientEmail: string
  recipientName: string | null
  expiresAt: string
  // Populeres kun for state='already_confirmed'
  confirmedAt?: string
  confirmedByName?: string
  confirmedByEmail?: string
  confirmationNote?: string
}

// =====================================================
// Input — submitConfirmation
// =====================================================
export interface SubmitConfirmationInput {
  token: string
  signerName: string
  signerEmail: string
  note?: string | null
}

// =====================================================
// Intern liste (CRM-medarbejder ser)
// =====================================================
export interface ConfirmationListItem {
  id: string
  recipientEmail: string
  recipientName: string | null
  recipientRole: ConfirmationRecipientRole
  recipientType: ConfirmationRecipientType
  status: ConfirmationStatus
  /** Beregnet (expires_at < NOW() AND status IN ('sent','opened')) */
  isExpired: boolean
  expiresAt: string
  mailSentAt: string | null
  mailError: string | null
  firstOpenedAt: string | null
  lastOpenedAt: string | null
  openCount: number
  confirmedAt: string | null
  confirmedByName: string | null
  confirmedByEmail: string | null
  confirmationNote: string | null
  revokedAt: string | null
  revokedReason: string | null
  createdAt: string
  /** Fase 2a — sekvens-info hvis denne row er del af en gated kæde. */
  sequence: ConfirmationSequenceMeta | null
  /** Fase 2a — trin er frigivet (forrige trin godkendt) og klar til at kontoret
   *  sender det videre manuelt. Kun relevant for gated, ikke-sendte trin. */
  readyToSend: boolean
}
