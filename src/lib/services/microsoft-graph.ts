/**
 * Microsoft Graph API Client — Mail Bridge
 *
 * Minimal implementation for polling one shared mailbox (crm@eltasolar.dk).
 * Uses OAuth2 client_credentials flow (app-only, no user interaction).
 *
 * Required env vars:
 *   AZURE_TENANT_ID     - Azure AD tenant
 *   AZURE_CLIENT_ID     - App registration client ID
 *   AZURE_CLIENT_SECRET  - App registration secret
 *   GRAPH_MAILBOX        - Mailbox to poll (default: crm@eltasolar.dk)
 */

import { logger } from '@/lib/utils/logger'
import type {
  GraphMailMessage,
  GraphDeltaResponse,
  GraphAttachment,
} from '@/types/mail-bridge.types'

// =====================================================
// Configuration
// =====================================================

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token'
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'
const DEFAULT_MAILBOX = 'crm@eltasolar.dk'
const MAX_MESSAGES_PER_POLL = 50

// =====================================================
// Token cache (in-memory, per serverless invocation)
// =====================================================

let cachedToken: { accessToken: string; expiresAt: number } | null = null

// =====================================================
// Configuration helpers
// =====================================================

function getConfig() {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  const mailbox = process.env.GRAPH_MAILBOX || DEFAULT_MAILBOX

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Microsoft Graph not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.'
    )
  }

  return { tenantId, clientId, clientSecret, mailbox }
}

export function isGraphConfigured(): boolean {
  return !!(
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET
  )
}

export function getMailbox(): string {
  return process.env.GRAPH_MAILBOX || DEFAULT_MAILBOX
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

async function graphFetch<T>(url: string): Promise<T> {
  const token = await getAccessToken()

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'outlook.body-content-type="html"',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('Graph API request failed', {
      metadata: { url, status: response.status, body: errorText.substring(0, 500) },
    })
    throw new Error(`Graph API error: ${response.status}`)
  }

  return response.json()
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
  deltaLink: string | null
): Promise<GraphDeltaResponse> {
  const { mailbox } = getConfig()

  let url: string

  if (deltaLink) {
    // Incremental fetch — use existing delta link
    url = deltaLink
  } else {
    // Initial fetch — get recent messages with delta tracking
    url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages/delta` +
      `?$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,replyTo,hasAttachments,receivedDateTime,isRead` +
      `&$top=${MAX_MESSAGES_PER_POLL}` +
      `&$orderby=receivedDateTime desc`
  }

  const result = await graphFetch<GraphDeltaResponse>(url)

  logger.info('Graph inbox polled', {
    metadata: {
      mailbox,
      messagesReturned: result.value.length,
      hasDeltaLink: !!result['@odata.deltaLink'],
      hasNextLink: !!result['@odata.nextLink'],
    },
  })

  return result
}

/**
 * Fetch all pages of a delta response until we hit the deltaLink.
 * Caps at maxPages to prevent runaway pagination on initial sync.
 */
export async function pollInboxFull(
  deltaLink: string | null,
  maxPages: number = 5
): Promise<{ messages: GraphMailMessage[]; newDeltaLink: string | null }> {
  const allMessages: GraphMailMessage[] = []
  let currentDeltaLink = deltaLink
  let newDeltaLink: string | null = null
  let page = 0

  while (page < maxPages) {
    const response = await pollInbox(currentDeltaLink)
    allMessages.push(...response.value)

    if (response['@odata.deltaLink']) {
      // We've reached the end — save this for next sync
      newDeltaLink = response['@odata.deltaLink']
      break
    }

    if (response['@odata.nextLink']) {
      // More pages available
      currentDeltaLink = response['@odata.nextLink']
      page++
    } else {
      break
    }
  }

  return { messages: allMessages, newDeltaLink }
}

// =====================================================
// Fetch attachments for a message
// =====================================================

export async function fetchAttachments(
  messageId: string
): Promise<GraphAttachment[]> {
  const { mailbox } = getConfig()

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
  attachmentId: string
): Promise<GraphAttachment & { contentBytes: string }> {
  const { mailbox } = getConfig()

  const url =
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/messages/${messageId}/attachments/${attachmentId}` +
    `?$select=id,name,contentType,size,contentBytes`

  return graphFetch(url)
}

/**
 * Fetch a message with attachments expanded inline (single API call).
 * More efficient than separate calls when you need both message + attachments.
 */
export async function fetchMessageWithAttachments(
  messageId: string
): Promise<GraphMailMessage> {
  const { mailbox } = getConfig()

  const url =
    `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/messages/${messageId}` +
    `?$expand=attachments($select=id,name,contentType,size,contentBytes)` +
    `&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,replyTo,hasAttachments,receivedDateTime,isRead`

  return graphFetch(url)
}

/**
 * Fetch latest messages with attachments expanded (for dashboard/list view).
 * Returns messages with attachment metadata (without contentBytes for performance).
 */
export async function fetchMessagesWithAttachments(
  top: number = 10
): Promise<GraphMailMessage[]> {
  const { mailbox } = getConfig()

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

export async function markAsRead(messageId: string): Promise<void> {
  const { mailbox } = getConfig()
  const token = await getAccessToken()

  const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/messages/${messageId}`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isRead: true }),
  })

  if (!response.ok) {
    logger.warn('Failed to mark Graph message as read', {
      metadata: { messageId, status: response.status },
    })
  }
}

// =====================================================
// Test connection
// =====================================================

export async function testGraphConnection(): Promise<{
  success: boolean
  mailbox: string
  error?: string
}> {
  try {
    const { mailbox } = getConfig()
    const token = await getAccessToken()

    // Try to access the mailbox
    const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox?$select=displayName,totalItemCount,unreadItemCount`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        mailbox,
        error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`,
      }
    }

    const data = await response.json()
    logger.info('Graph connection test passed', {
      metadata: {
        mailbox,
        totalItems: data.totalItemCount,
        unreadItems: data.unreadItemCount,
      },
    })

    return { success: true, mailbox }
  } catch (error) {
    return {
      success: false,
      mailbox: process.env.GRAPH_MAILBOX || DEFAULT_MAILBOX,
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
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
  }>
}

/**
 * Send email via Microsoft Graph API (as the CRM mailbox).
 * Requires Mail.Send application permission in Azure AD.
 */
export async function sendEmailViaGraph(
  options: GraphEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { mailbox } = getConfig()
    const token = await getAccessToken()

    const toRecipients = (Array.isArray(options.to) ? options.to : [options.to]).map((addr) => ({
      emailAddress: { address: addr },
    }))

    // Build attachments array
    const graphAttachments = (options.attachments || []).map((att) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: att.filename,
      contentType: att.contentType,
      contentBytes: att.content.toString('base64'),
    }))

    // Build the sendMail payload
    const payload: Record<string, unknown> = {
      message: {
        subject: options.subject,
        body: {
          contentType: 'HTML',
          content: options.html,
        },
        toRecipients,
        ...(options.replyTo
          ? {
              replyTo: [{ emailAddress: { address: options.replyTo } }],
            }
          : {}),
        ...(graphAttachments.length > 0 ? { attachments: graphAttachments } : {}),
        ...(options.senderName
          ? {
              from: {
                emailAddress: {
                  name: `${options.senderName} | Elta Solar`,
                  address: mailbox,
                },
              },
            }
          : {}),
      },
      saveToSentItems: true,
    }

    const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(mailbox)}/sendMail`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Graph sendMail failed', {
        metadata: { status: response.status, body: errorText.substring(0, 500) },
      })
      return { success: false, error: `Graph sendMail fejl: ${response.status} — ${errorText.substring(0, 200)}` }
    }

    // 202 Accepted = success (no body returned)
    logger.info('Email sent via Graph API', {
      metadata: { to: options.to, subject: options.subject },
    })

    return { success: true }
  } catch (error) {
    logger.error('sendEmailViaGraph failed', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Ukendt Graph-fejl',
    }
  }
}
