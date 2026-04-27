/**
 * Microsoft Graph API Client — Mail Bridge (Multi-Mailbox)
 *
 * Polls one or more shared mailboxes via app-only (client_credentials) permissions.
 * All mailboxes share the same Azure AD app registration.
 *
 * Required env vars:
 *   AZURE_TENANT_ID      - Azure AD tenant
 *   AZURE_CLIENT_ID      - App registration client ID
 *   AZURE_CLIENT_SECRET   - App registration secret
 *   GRAPH_MAILBOX         - Default send-from mailbox (kontakt@eltasolar.dk)
 *   GRAPH_MAILBOXES       - Comma-separated list of ALL mailboxes to sync
 *                           (e.g. "kontakt@eltasolar.dk,ordre@eltasolar.dk")
 *                           Falls back to GRAPH_MAILBOX if not set.
 */

import { logger } from '@/lib/utils/logger'
import type {
  GraphMailMessage,
  GraphDeltaResponse,
  GraphAttachment,
  CrmMailbox,
} from '@/types/mail-bridge.types'

// =====================================================
// Configuration
// =====================================================

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'
const DEFAULT_MAILBOX = 'kontakt@eltasolar.dk'
const MAX_MESSAGES_PER_POLL = 50

// =====================================================
// Token cache (in-memory, per serverless invocation)
// =====================================================

let cachedToken: { accessToken: string; expiresAt: number } | null = null

// =====================================================
// Configuration helpers
// =====================================================

function getConfig() {
  const tenantId = (process.env.AZURE_TENANT_ID || process.env.AZURE_AD_TENANT_ID || '').trim()
  const clientId = (process.env.AZURE_CLIENT_ID || process.env.AZURE_AD_CLIENT_ID || '').trim()
  const clientSecret = (process.env.AZURE_CLIENT_SECRET || process.env.AZURE_AD_CLIENT_SECRET || '').trim()
  const mailbox = (process.env.GRAPH_MAILBOX || DEFAULT_MAILBOX).trim()

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Microsoft Graph not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.'
    )
  }

  return { tenantId, clientId, clientSecret, mailbox }
}

export function isGraphConfigured(): boolean {
  return !!(
    (process.env.AZURE_TENANT_ID || process.env.AZURE_AD_TENANT_ID) &&
    (process.env.AZURE_CLIENT_ID || process.env.AZURE_AD_CLIENT_ID) &&
    (process.env.AZURE_CLIENT_SECRET || process.env.AZURE_AD_CLIENT_SECRET)
  )
}

/** Default send-from mailbox (GRAPH_MAILBOX env var). */
export function getMailbox(): string {
  return (process.env.GRAPH_MAILBOX || DEFAULT_MAILBOX).trim()
}

/**
 * All active mailboxes to sync (GRAPH_MAILBOXES env var, comma-separated).
 * Falls back to [GRAPH_MAILBOX] if GRAPH_MAILBOXES is not set.
 */
export function getMailboxes(): CrmMailbox[] {
  const raw = (process.env.GRAPH_MAILBOXES || '').trim()
  const defaultMb = getMailbox()

  if (!raw) {
    // Single-mailbox fallback
    return [{ email: defaultMb, type: inferMailboxType(defaultMb), active: true }]
  }

  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(s => s.includes('@'))
    .map(email => ({
      email,
      type: inferMailboxType(email),
      active: true,
    }))
}

/** Infer mailbox type from the email address prefix. */
function inferMailboxType(email: string): CrmMailbox['type'] {
  const prefix = email.split('@')[0].toLowerCase()
  if (prefix === 'ordre' || prefix === 'order' || prefix === 'orders') return 'ordre'
  if (prefix === 'kontakt' || prefix === 'contact' || prefix === 'info') return 'kontakt'
  return 'unknown'
}

/**
 * Resolve which mailbox to use for a Graph API call.
 * If an explicit override is provided, use it.
 * Otherwise fall back to GRAPH_MAILBOX env var → DEFAULT_MAILBOX.
 */
function resolveMailbox(override?: string): string {
  if (override && override.trim()) {
    return override.trim()
  }
  return getConfig().mailbox
}

/**
 * Get the default mailbox for sending outbound emails.
 * Uses GRAPH_MAILBOX env var, falls back to kontakt@eltasolar.dk.
 * This is separate from resolveMailbox() which is for any Graph call.
 */
export function getDefaultSendMailbox(): string {
  return (process.env.GRAPH_MAILBOX || DEFAULT_MAILBOX).trim()
}

// =====================================================
// OAuth2 Client Credentials
// =====================================================

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.accessToken
  }

  const { tenantId, clientId, clientSecret } = getConfig()
  const tokenUrl = TOKEN_ENDPOINT.replace('{tenant}', tenantId)

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: GRAPH_SCOPE,
    grant_type: 'client_credentials',
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('Graph token request failed', {
      metadata: { status: response.status, body: errorText.substring(0, 500) },
    })
    throw new Error(`Graph auth failed: ${response.status}`)
  }

  const data = await response.json()
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  logger.info('Graph access token acquired', {
    metadata: { expiresIn: data.expires_in },
  })

  return cachedToken.accessToken
}

// =====================================================
// Graph API fetch helper
// =====================================================

async function graphFetch<T>(
  url: string,
  options?: { method?: string; body?: string; timeoutMs?: number; headers?: Record<string, string> }
): Promise<T> {
  const method = options?.method || 'GET'
  const timeoutMs = options?.timeoutMs || 30_000
  const maxRetries = 2

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const token = await getAccessToken()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'outlook.body-content-type="html"',
          ...options?.headers,
        },
        body: options?.body,
        signal: controller.signal,
      })

      // On 401, invalidate cached token and retry
      if (response.status === 401 && attempt < maxRetries) {
        cachedToken = null
        logger.warn('Graph API 401 — token expired, refreshing', {
          metadata: { url, attempt: attempt + 1 },
        })
        continue
      }

      // On 429 (throttled), wait and retry
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10)
        logger.warn('Graph API 429 — throttled, waiting', {
          metadata: { url, retryAfterSec: retryAfter, attempt: attempt + 1 },
        })
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
        continue
      }

      // On 5xx, retry once
      if (response.status >= 500 && attempt < maxRetries) {
        logger.warn('Graph API 5xx — server error, retrying', {
          metadata: { url, status: response.status, attempt: attempt + 1 },
        })
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        continue
      }

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Graph API request failed', {
          metadata: { url, status: response.status, body: errorText.substring(0, 500) },
        })
        throw new Error(`Graph API error: ${response.status}`)
      }

      // Handle 204 No Content (e.g. PATCH responses)
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {} as T
      }

      return response.json()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        logger.error('Graph API request timed out', {
          metadata: { url, timeoutMs },
        })
        throw new Error(`Graph API timeout after ${timeoutMs}ms`)
      }
      // On network errors, retry once
      if (attempt < maxRetries && error instanceof TypeError) {
        logger.warn('Graph API network error, retrying', {
          metadata: { url, attempt: attempt + 1 },
          error,
        })
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        continue
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('Graph API: max retries exceeded')
}

// =====================================================
// Mail Polling — Delta Query
// =====================================================

/**
 * Fetch new emails using Graph delta query.
 * If deltaLink is provided, fetches only new/changed messages since last sync.
 * If null, performs initial sync (latest N messages from inbox).
 */
export async function pollInbox(
  deltaLink: string | null,
  mailboxOverride?: string
): Promise<GraphDeltaResponse> {
  const mailbox = resolveMailbox(mailboxOverride)
  const encodedMailbox = encodeURIComponent(mailbox)

  let url: string
  let usedDelta = false
  const isValidDelta = deltaLink?.includes(`/users/${encodedMailbox}/`)

  if (deltaLink && isValidDelta) {
    url = deltaLink
    usedDelta = true
  } else {
    if (deltaLink && !isValidDelta) {
      logger.warn('Discarding stale delta link (wrong mailbox)', {
        metadata: { mailbox, deltaLinkMailbox: 'mismatch' },
      })
    }
    url = `${GRAPH_BASE_URL}/users/${encodedMailbox}/mailFolders/inbox/messages/delta` +
      `?$select=id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,replyTo,hasAttachments,receivedDateTime,isRead` +
      `&$top=${MAX_MESSAGES_PER_POLL}` +
      `&$orderby=receivedDateTime desc`
  }

  const result = await graphFetch<GraphDeltaResponse>(url)

  logger.info('Graph inbox polled', {
    metadata: {
      mailbox,
      usedDelta,
      messagesReturned: result.value.length,
      hasDeltaLink: !!result['@odata.deltaLink'],
      hasNextLink: !!result['@odata.nextLink'],
    },
  })

  return result
}

export async function pollInboxFull(
  deltaLink: string | null,
  maxPages: number = 5,
  mailboxOverride?: string
): Promise<{ messages: GraphMailMessage[]; newDeltaLink: string | null }> {
  const allMessages: GraphMailMessage[] = []
  let currentDeltaLink = deltaLink
  let newDeltaLink: string | null = null
  let page = 0
  let reachedEnd = false

  while (page < maxPages) {
    const response = await pollInbox(currentDeltaLink, mailboxOverride)
    allMessages.push(...response.value)

    if (response['@odata.deltaLink']) {
      newDeltaLink = response['@odata.deltaLink']
      reachedEnd = true
      break
    }

    if (response['@odata.nextLink']) {
      currentDeltaLink = response['@odata.nextLink']
      page++
    } else {
      reachedEnd = true
      break
    }
  }

  // If we hit the page cap without reaching a deltaLink, save the next
  // skipToken URL so the next sync continues from where we left off.
  // Without this, large inboxes restart at page 1 every sync and never
  // make progress past the first maxPages * $top messages.
  if (!reachedEnd && currentDeltaLink) {
    newDeltaLink = currentDeltaLink
  }

  return { messages: allMessages, newDeltaLink }
}

/**
 * Drain the delta query without keeping the message bodies, until Graph
 * returns an @odata.deltaLink. The returned link is the cursor "everything
 * up to now is consumed" — store it in graph_sync_state so the next sync
 * only fetches mail that arrives AFTER this point.
 *
 * Use this when the inbox already contains the historical messages (in DB)
 * and you only want new mail going forward.
 */
export async function fastForwardDelta(
  mailboxOverride?: string,
  maxPages: number = 200
): Promise<{ deltaLink: string | null; pagesScanned: number; messagesScanned: number }> {
  let currentLink: string | null = null
  let deltaLink: string | null = null
  let pages = 0
  let messages = 0

  while (pages < maxPages) {
    const response = await pollInbox(currentLink, mailboxOverride)
    messages += response.value.length
    pages++

    if (response['@odata.deltaLink']) {
      deltaLink = response['@odata.deltaLink']
      break
    }

    if (response['@odata.nextLink']) {
      currentLink = response['@odata.nextLink']
    } else {
      break
    }
  }

  return { deltaLink, pagesScanned: pages, messagesScanned: messages }
}

// =====================================================
// Fetch attachments for a message
// =====================================================

export async function fetchAttachments(
  messageId: string,
  mailboxOverride?: string
): Promise<GraphAttachment[]> {
  const mailbox = resolveMailbox(mailboxOverride)

  const url =
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments` +
    `?$select=id,name,contentType,size`

  const result = await graphFetch<{ value: GraphAttachment[] }>(url)
  return result.value
}

/**
 * Fetch a single attachment with its full content (base64).
 * Use this to download and store attachments in Supabase Storage.
 */
export async function fetchAttachmentContent(
  messageId: string,
  attachmentId: string,
  mailboxOverride?: string
): Promise<GraphAttachment & { contentBytes: string }> {
  const mailbox = resolveMailbox(mailboxOverride)

  const url =
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments/${attachmentId}` +
    `?$select=id,name,contentType,size,contentBytes`

  return graphFetch(url)
}

/**
 * Fetch a message with its attachments (including contentBytes).
 * Uses the /attachments collection endpoint which returns contentBytes by default.
 * Note: $expand=attachments($select=contentBytes) does NOT work in Graph API.
 */
export async function fetchMessageWithAttachments(
  messageId: string,
  mailboxOverride?: string
): Promise<GraphMailMessage> {
  const mailbox = resolveMailbox(mailboxOverride)

  // Fetch message metadata
  const msgUrl =
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/messages/${messageId}` +
    `?$select=id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,replyTo,hasAttachments,receivedDateTime,isRead`
  const message: GraphMailMessage = await graphFetch(msgUrl)

  // Fetch attachments separately (this returns contentBytes by default)
  const attUrl =
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments`
  const attData = await graphFetch<{ value: GraphAttachment[] }>(attUrl)
  message.attachments = attData.value || []

  return message
}

/**
 * Fetch latest messages with attachments expanded (for dashboard/list view).
 * Returns messages with attachment metadata (without contentBytes for performance).
 */
export async function fetchMessagesWithAttachments(
  top: number = 10,
  mailboxOverride?: string
): Promise<GraphMailMessage[]> {
  const mailbox = resolveMailbox(mailboxOverride)

  const url =
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/messages` +
    `?$expand=attachments($select=id,name,contentType,size)` +
    `&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead` +
    `&$top=${top}` +
    `&$orderby=receivedDateTime desc`

  const result = await graphFetch<{ value: GraphMailMessage[] }>(url)
  return result.value
}

// =====================================================
// Mark message as read in Graph
// =====================================================

export async function markAsRead(messageId: string, mailboxOverride?: string): Promise<void> {
  const mailbox = resolveMailbox(mailboxOverride)
  const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/messages/${messageId}`

  try {
    await graphFetch(url, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true }),
    })
  } catch (error) {
    logger.warn('Failed to mark Graph message as read', {
      metadata: { messageId },
      error,
    })
  }
}

// =====================================================
// Test connection
// =====================================================

export async function testGraphConnection(mailboxOverride?: string): Promise<{
  success: boolean
  mailbox: string
  error?: string
  totalItems?: number
  unreadItems?: number
}> {
  const mailbox = resolveMailbox(mailboxOverride)

  try {
    const token = await getAccessToken()
    const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox?$select=displayName,totalItemCount,unreadItemCount`

    logger.info('Testing Graph connection', { metadata: { mailbox, url: url.substring(0, 100) } })

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      const errorText = await response.text()

      // Parse Graph error for specific code
      let graphCode = `HTTP ${response.status}`
      let graphMessage = errorText.substring(0, 300)
      try {
        const errJson = JSON.parse(errorText)
        if (errJson.error) {
          graphCode = errJson.error.code || graphCode
          graphMessage = errJson.error.message || graphMessage
        }
      } catch { /* not JSON */ }

      const userError = response.status === 403
        ? `Adgang nægtet (403) for ${mailbox}. App mangler Mail.Read permission eller admin consent for denne postkasse. Azure-fejl: ${graphCode}: ${graphMessage}`
        : response.status === 404
          ? `Postkasse ikke fundet (404): ${mailbox}. Tjek at adressen eksisterer i Azure AD / Exchange Online og at den er en rigtig postkasse (ikke kun et alias).`
          : `${graphCode}: ${graphMessage}`

      logger.error('Graph connection test failed', {
        metadata: { mailbox, status: response.status, graphCode, graphMessage },
      })

      return { success: false, mailbox, error: userError }
    }

    const data = await response.json()
    logger.info('Graph connection test passed', {
      metadata: { mailbox, totalItems: data.totalItemCount, unreadItems: data.unreadItemCount },
    })

    return {
      success: true,
      mailbox,
      totalItems: data.totalItemCount,
      unreadItems: data.unreadItemCount,
    }
  } catch (error) {
    logger.error('Graph connection test exception', { metadata: { mailbox }, error })
    return {
      success: false,
      mailbox,
      error: error instanceof Error ? error.message : 'Ukendt fejl',
    }
  }
}

// =====================================================
// Send Email via Graph API
// =====================================================

export interface GraphEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  senderName?: string
  /** Which mailbox to send FROM. Defaults to GRAPH_MAILBOX (kontakt@). */
  fromMailbox?: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
}

/**
 * Send email via Microsoft Graph API (as the CRM mailbox).
 * Requires Mail.Send application permission in Azure AD.
 *
 * Uses app-only (client_credentials) auth — the email is sent FROM the
 * shared mailbox automatically. We do NOT set the `from` field because
 * that requires additional SendAs permission which may not be granted.
 */
export async function sendEmailViaGraph(
  options: GraphEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const mailbox = resolveMailbox(options.fromMailbox)

    // Validate required fields
    const recipients = Array.isArray(options.to) ? options.to : [options.to]
    if (recipients.length === 0 || recipients.some((r) => !r || !r.includes('@'))) {
      return { success: false, error: 'Ugyldig modtager-adresse' }
    }
    if (!options.subject) {
      return { success: false, error: 'Emne mangler' }
    }
    if (!options.html) {
      return { success: false, error: 'Email-indhold mangler' }
    }

    const toRecipients = recipients.map((addr) => ({
      emailAddress: { address: addr.trim() },
    }))

    // Build attachments array
    const graphAttachments = (options.attachments || []).map((att) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: att.filename,
      contentType: att.contentType,
      contentBytes: att.content.toString('base64'),
    }))

    // Sanitize HTML content — strip control characters that break Graph API JSON parsing
    const safeHtml = options.html
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Strip control chars
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n') // Normalize lone CR
      .replace(/[\u2028\u2029]/g, '\n') // Strip Unicode line/paragraph separators (break JSON)

    // Build the sendMail payload — strict Graph API v1.0 format
    // Note: Do NOT set `from` with app-only auth — requires SendAs permission.
    // The email will be sent from the mailbox user automatically.
    const message: Record<string, unknown> = {
      subject: options.subject.trim(),
      body: {
        contentType: 'HTML',
        content: safeHtml,
      },
      toRecipients,
    }

    // Always set replyTo to the CRM mailbox so customer replies come back to CRM.
    // Use explicit override if provided, otherwise default to the configured mailbox.
    const replyToAddr = options.replyTo?.trim() || mailbox
    message.replyTo = [{ emailAddress: { address: replyToAddr } }]

    // Optional: attachments
    if (graphAttachments.length > 0) {
      message.attachments = graphAttachments
    }

    const payload = {
      message,
      saveToSentItems: true,
    }

    const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/sendMail`

    logger.info('Graph sendMail request', {
      metadata: {
        url,
        mailbox,
        mailboxLength: mailbox.length,
        to: recipients,
        subject: options.subject,
        bodyLength: options.html.length,
        payloadKeys: Object.keys(message),
      },
    })

    // Send with retry on 401 (token expired)
    let response: Response | null = null
    for (let attempt = 0; attempt <= 1; attempt++) {
      const currentToken = await getAccessToken()
      const controller = new AbortController()
      const sendTimeout = setTimeout(() => controller.abort(), 30_000)

      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } catch (fetchError) {
        clearTimeout(sendTimeout)
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
          return { success: false, error: 'Email-afsendelse timeout efter 30s' }
        }
        throw fetchError
      } finally {
        clearTimeout(sendTimeout)
      }

      // Retry on 401 with fresh token
      if (response.status === 401 && attempt === 0) {
        cachedToken = null
        logger.warn('Graph sendMail 401 — refreshing token and retrying')
        continue
      }
      break
    }

    if (!response) {
      return { success: false, error: 'Ingen respons fra Graph API' }
    }

    if (!response.ok) {
      const errorText = await response.text()

      // Parse Graph API error for a clear message
      let graphError = `HTTP ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error) {
          graphError = `${errorJson.error.code}: ${errorJson.error.message}`
        }
      } catch {
        graphError = `HTTP ${response.status}: ${errorText.substring(0, 300)}`
      }

      logger.error('Graph sendMail failed', {
        metadata: {
          status: response.status,
          graphError,
          mailbox,
          to: recipients,
        },
      })

      // Provide user-friendly errors for common codes
      if (response.status === 400) {
        return {
          success: false,
          error: `Ugyldig forespørgsel (400). ${graphError}. Tjek at modtager-adresse og emne er korrekte.`,
        }
      }
      if (response.status === 403) {
        return {
          success: false,
          error: `Adgang nægtet (403). Azure AD app mangler Mail.Send permission. Tilføj den i Azure Portal → App registrations → API permissions.`,
        }
      }
      if (response.status === 404) {
        return {
          success: false,
          error: `Postkasse ikke fundet (404). Tjek at ${mailbox} eksisterer og er tilgængelig.`,
        }
      }

      return { success: false, error: `Graph fejl: ${graphError}` }
    }

    // 202 Accepted = success (no body returned)
    logger.info('Email sent via Graph API', {
      metadata: { to: recipients, subject: options.subject, mailbox },
    })

    // Try to find the sent message ID from the Sent Items folder
    // Graph sendMail returns 202 with no body, but we can query the latest sent message
    let sentMessageId: string | undefined
    try {
      const sentUrl = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/mailFolders/sentItems/messages` +
        `?$select=id,conversationId&$top=1&$orderby=sentDateTime desc` +
        `&$filter=subject eq '${options.subject.replace(/'/g, "''")}'`
      const sentResult = await graphFetch<{ value: Array<{ id: string; conversationId: string }> }>(sentUrl)
      if (sentResult.value?.[0]) {
        sentMessageId = sentResult.value[0].id
      }
    } catch {
      // Non-critical — we still sent the email successfully
    }

    return { success: true, messageId: sentMessageId }
  } catch (error) {
    logger.error('sendEmailViaGraph failed', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ukendt Graph-fejl',
    }
  }
}

// =====================================================
// Poll Sent Items folder (for sent email sync)
// =====================================================

/**
 * Fetch recent sent items from the mailbox.
 * Used to sync outbound emails into the CRM after they've been sent
 * (either via Graph sendMail or directly from Outlook).
 */
export async function pollSentItems(
  sinceDateTime: string | null,
  top: number = 25,
  mailboxOverride?: string
): Promise<GraphMailMessage[]> {
  const mailbox = resolveMailbox(mailboxOverride)

  let url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/mailFolders/sentItems/messages` +
    `?$select=id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,replyTo,hasAttachments,receivedDateTime,isRead` +
    `&$top=${top}` +
    `&$orderby=sentDateTime desc`

  if (sinceDateTime) {
    url += `&$filter=sentDateTime ge ${sinceDateTime}`
  }

  const result = await graphFetch<{ value: GraphMailMessage[] }>(url)

  logger.info('Graph sent items polled', {
    metadata: {
      mailbox,
      messagesReturned: result.value.length,
      sinceDateTime,
    },
  })

  return result.value
}

// =====================================================
// Invalidate token cache (for manual reset)
// =====================================================

export function invalidateTokenCache(): void {
  cachedToken = null
}

// =====================================================
// Fetch message headers (for In-Reply-To / References)
// =====================================================

/**
 * Fetch internetMessageHeaders for a specific message.
 * Used after delta sync to get In-Reply-To and References headers
 * which are not available in delta query results.
 */
export async function fetchMessageHeaders(
  messageId: string,
  mailboxOverride?: string
): Promise<{ inReplyTo: string | null; references: string | null }> {
  const mailbox = resolveMailbox(mailboxOverride)
  const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/messages/${messageId}` +
    `?$select=internetMessageHeaders`

  const result = await graphFetch<{ internetMessageHeaders?: Array<{ name: string; value: string }> }>(url)
  const headers = result.internetMessageHeaders || []

  return {
    inReplyTo: headers.find(h => h.name.toLowerCase() === 'in-reply-to')?.value || null,
    references: headers.find(h => h.name.toLowerCase() === 'references')?.value || null,
  }
}

// =====================================================
// Diagnostic: fetch latest N messages directly (no delta)
// =====================================================

/**
 * Fetch the latest messages from the inbox WITHOUT delta queries.
 * Used for debugging to see what's actually in the mailbox.
 * Returns raw message data with subjects, senders, dates, conversationIds.
 */
export async function debugFetchInbox(top: number = 10, mailboxOverride?: string): Promise<{
  mailbox: string
  messages: Array<{
    id: string
    subject: string | null
    from: string
    fromName: string
    receivedDateTime: string
    conversationId: string | null
    internetMessageId: string | null
    isRead: boolean
  }>
  error?: string
}> {
  try {
    const mailbox = resolveMailbox(mailboxOverride)

    const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages` +
      `?$select=id,conversationId,internetMessageId,subject,from,receivedDateTime,isRead` +
      `&$top=${top}` +
      `&$orderby=receivedDateTime desc`

    const result = await graphFetch<{ value: GraphMailMessage[] }>(url)

    return {
      mailbox,
      messages: result.value.map(m => ({
        id: m.id,
        subject: m.subject,
        from: m.from.emailAddress.address,
        fromName: m.from.emailAddress.name,
        receivedDateTime: m.receivedDateTime,
        conversationId: m.conversationId,
        internetMessageId: m.internetMessageId || null,
        isRead: m.isRead,
      })),
    }
  } catch (error) {
    return {
      mailbox: process.env.GRAPH_MAILBOX || DEFAULT_MAILBOX,
      messages: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
