'use server'

/**
 * Sprint 8E-1A: Live-beregning af "kræver svar"-status for mails.
 *
 * Ingen materialized kolonne — beregnes pr. request via 2-query approach:
 * 1. Hent input-emails med deres conversation_id
 * 2. Hent ALLE messages i de samme conversations
 * 3. For hver conversation: find seneste inbound vs outbound
 * 4. Marker email som requires_response hvis seneste er inbound + customer_id
 *    sat + link_status ikke ignored/pending
 *
 * Skalering: 2 queries totalt, uafhængigt af antallet af input-emails.
 * For >10k threads kan materialiseret kolonne blive nødvendig (Sprint 8E-1B
 * eller senere migration).
 */

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

export interface EmailRequiresResponseInfo {
  emailId: string
  requiresResponse: boolean
  ageHours: number | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
}

const INTERNAL_DOMAIN = '@eltasolar.dk'

function isInternalSender(senderEmail: string | null | undefined): boolean {
  if (!senderEmail) return false
  return senderEmail.toLowerCase().includes(INTERNAL_DOMAIN)
}

/**
 * Batch-beregn requires_response for en liste af email-IDs.
 * Returnerer Record<emailId, info>.
 */
export async function getRequiresResponseStatus(
  emailIds: string[]
): Promise<Record<string, EmailRequiresResponseInfo>> {
  if (emailIds.length === 0) return {}

  const supabase = await createClient()
  const result: Record<string, EmailRequiresResponseInfo> = {}

  try {
    // 1. Hent input-emails med conversation_id + meta
    const { data: inputEmails, error: inputErr } = await supabase
      .from('incoming_emails')
      .select('id, conversation_id, customer_id, link_status, sender_email, received_at')
      .in('id', emailIds)

    if (inputErr || !inputEmails) {
      logger.error('getRequiresResponseStatus: input fetch failed', { error: inputErr })
      return {}
    }

    // 2. Saml unikke conversation_ids
    const convIds = Array.from(
      new Set(inputEmails.map((e) => e.conversation_id).filter((c): c is string => !!c))
    )

    // 3. Hent alle messages i samme conversations (én batch-query)
    const convStats: Map<string, { lastInboundAt: string | null; lastOutboundAt: string | null }> = new Map()

    if (convIds.length > 0) {
      const { data: convMessages, error: convErr } = await supabase
        .from('incoming_emails')
        .select('conversation_id, sender_email, received_at')
        .in('conversation_id', convIds)
        .eq('is_archived', false)

      if (convErr) {
        logger.warn('getRequiresResponseStatus: conversation fetch failed', { error: convErr })
      } else if (convMessages) {
        for (const msg of convMessages) {
          const cid = msg.conversation_id
          if (!cid) continue
          const stats = convStats.get(cid) || { lastInboundAt: null, lastOutboundAt: null }
          const ts = msg.received_at as string
          if (isInternalSender(msg.sender_email)) {
            if (!stats.lastOutboundAt || ts > stats.lastOutboundAt) {
              stats.lastOutboundAt = ts
            }
          } else {
            if (!stats.lastInboundAt || ts > stats.lastInboundAt) {
              stats.lastInboundAt = ts
            }
          }
          convStats.set(cid, stats)
        }
      }
    }

    // 4. Beregn requires_response pr. input-email
    const now = Date.now()
    for (const email of inputEmails) {
      const stats = email.conversation_id
        ? convStats.get(email.conversation_id)
        : null

      // For mails uden conversation_id: brug emailens egen received_at
      // som "seneste inbound" hvis den er fra extern sender, ellers ingen status
      let lastInboundAt = stats?.lastInboundAt || null
      let lastOutboundAt = stats?.lastOutboundAt || null
      if (!stats && !isInternalSender(email.sender_email)) {
        lastInboundAt = email.received_at as string
      } else if (!stats && isInternalSender(email.sender_email)) {
        lastOutboundAt = email.received_at as string
      }

      let requiresResponse = false
      let ageHours: number | null = null

      if (
        email.customer_id != null &&
        email.link_status !== 'ignored' &&
        email.link_status !== 'pending' &&
        lastInboundAt &&
        (!lastOutboundAt || lastOutboundAt < lastInboundAt)
      ) {
        requiresResponse = true
        ageHours = (now - new Date(lastInboundAt).getTime()) / 3_600_000
      }

      result[email.id] = {
        emailId: email.id,
        requiresResponse,
        ageHours,
        lastInboundAt,
        lastOutboundAt,
      }
    }

    return result
  } catch (err) {
    logger.error('getRequiresResponseStatus: unexpected error', { error: err })
    return {}
  }
}

/**
 * Returnér IDs på alle mails der kræver svar.
 * Bruges til "Kræver svar"-filter-tab på /dashboard/mail.
 *
 * Implementation: hent alle linked + non-ignored mails, derefter filtrer
 * via getRequiresResponseStatus. For pilot (<5000 mails) er det
 * acceptabelt. Hvis dette vokser, kan vi senere materialisere kolonnen.
 */
export async function getRequiresResponseEmailIds(): Promise<string[]> {
  const supabase = await createClient()

  try {
    // Hent kandidater: linked, ikke arkiveret, ikke ignoreret
    const { data: candidates, error } = await supabase
      .from('incoming_emails')
      .select('id')
      .eq('is_archived', false)
      .eq('link_status', 'linked')
      .limit(2000)

    if (error || !candidates || candidates.length === 0) return []

    const ids = candidates.map((c) => c.id as string)
    const statusMap = await getRequiresResponseStatus(ids)

    return ids.filter((id) => statusMap[id]?.requiresResponse === true)
  } catch (err) {
    logger.error('getRequiresResponseEmailIds: failed', { error: err })
    return []
  }
}

/**
 * Tæl antal mails der kræver svar (til counter-badge).
 */
export async function countRequiresResponseEmails(): Promise<number> {
  const ids = await getRequiresResponseEmailIds()
  return ids.length
}
