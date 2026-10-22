'use server'

/** UI-banner i MailDetail: åbne auto-opgaver for en mail/tråd (cron-logikken ligger i lib/services/auto-tasks). */
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

/**
 * Hent åbne auto-tasks for et bestemt source_email_id eller
 * source_conversation_id (til UI banner i MailDetail).
 */
export async function getOpenAutoTasksForEmail(
  emailId: string,
  conversationId: string | null
): Promise<Array<{ id: string; title: string; priority: string; created_at: string }>> {
  const supabase = await createClient()

  // Hvis conversation_id findes: prefer match på det. Ellers email_id.
  let query = supabase
    .from('customer_tasks')
    .select('id, title, priority, created_at')
    .eq('auto_generated', true)
    .neq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(5)

  if (conversationId) {
    query = query.eq('source_conversation_id', conversationId)
  } else {
    query = query.eq('source_email_id', emailId)
  }

  const { data, error } = await query

  if (error) {
    logger.warn('getOpenAutoTasksForEmail failed', {
      error,
      entityId: emailId,
    })
    return []
  }

  return (data || []) as Array<{
    id: string
    title: string
    priority: string
    created_at: string
  }>
}
