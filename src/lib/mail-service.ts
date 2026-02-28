/**
 * Mail Service — Unified facade for the Mail module
 *
 * Re-exports all mail functionality from a single entry point:
 *   - Inbound: Graph API polling, customer linking, AO detection
 *   - Outbound: SMTP sending with dynamic sender name + PDF attachments
 *
 * Required env vars:
 *   AZURE_TENANT_ID      - Azure AD tenant
 *   AZURE_CLIENT_ID      - App registration client ID
 *   AZURE_CLIENT_SECRET   - App registration client secret value (NOT the secret ID)
 *   GRAPH_MAILBOX         - Mailbox to poll (e.g. crm@eltasolar.dk)
 *   SMTP_HOST/PORT/USER/PASSWORD - Outbound SMTP config
 *
 * Required Azure permissions:
 *   Mail.Read (Application) — with Admin Consent
 *
 * Usage:
 *   import { syncEmails, testConnection, isConfigured } from '@/lib/mail-service'
 *   import { sendEmail } from '@/lib/email/email-service'
 */

// =====================================================
// Graph API — Connection & Polling
// =====================================================

export {
  isGraphConfigured as isConfigured,
  getMailbox,
  testGraphConnection as testConnection,
  pollInbox,
  pollInboxFull,
  fetchAttachments,
  fetchAttachmentContent,
  fetchMessageWithAttachments,
  fetchMessagesWithAttachments,
  markAsRead,
} from '@/lib/services/microsoft-graph'

// =====================================================
// Attachment Storage — Download & Supabase Storage
// =====================================================

export {
  downloadAndStoreAttachment,
  processEmailAttachments,
} from '@/lib/services/email-attachment-storage'

export type {
  StoredAttachment,
} from '@/lib/services/email-attachment-storage'

// =====================================================
// Email Sync — Full Pipeline
// =====================================================

export { runEmailSync as syncEmails } from '@/lib/services/email-sync-orchestrator'

// =====================================================
// Email Linking — Customer Matching
// =====================================================

export {
  linkEmail,
  manuallyLinkEmail as manualLink,
  ignoreEmail,
  matchCustomer,
  extractOriginalSender,
} from '@/lib/services/email-linker'

// =====================================================
// AO Product Detection — SKU Matching & Kalkia Prices
// =====================================================

export {
  detectAOProducts,
  extractAOSkus,
  lookupAOProducts,
  getKalkiaPriceUpdateSuggestions,
  applyKalkiaPriceUpdates,
} from '@/lib/services/email-ao-detector'

// =====================================================
// Types — Re-export all mail types
// =====================================================

export type {
  IncomingEmail,
  IncomingEmailWithCustomer,
  EmailLinkStatus,
  EmailAttachment,
  AOProductMatch,
  GraphSyncState,
  GraphMailMessage,
  GraphAttachment,
  GraphDeltaResponse,
  LinkResult,
  EmailSyncResult,
} from '@/types/mail-bridge.types'

export type {
  KalkiaPriceUpdateSuggestion,
} from '@/lib/services/email-ao-detector'

// =====================================================
// Quote Generation — "Den Gyldne Knap"
// =====================================================

export { generateAndSendQuote } from '@/lib/services/quote-generator'

export type {
  GenerateQuoteInput,
  GenerateQuoteResult,
  QuoteTemplateType,
} from '@/types/quote-templates.types'
