'use server'

/**
 * ELTA Assistant — CRM-siden af Telegram-koblingen (T10). Brugeren forbinder SIN EGEN Telegram-chat med en
 * engangskode; kun aktive brugere med customers.edit (fase 1: admin, serviceleder, salg). Alt audit-logges.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { createLinkCode, LINK_CODE_TTL_MIN } from '@/lib/assistant/telegram/link'
import { logger } from '@/lib/utils/logger'

export type TelegramLinkStatus = { allowed: boolean; linked: boolean; linkedAt: string | null }

async function audit(userId: string, action: string) {
  try {
    await createAdminClient().from('audit_logs').insert({
      user_id: userId,
      entity_type: 'assistant',
      action: `assistant_${action}`,
      action_description: `ELTA Assistant: ${action}`,
      metadata: { channel: 'telegram', source: 'crm' },
    })
  } catch (e) {
    logger.error('assistant audit failed', { error: e })
  }
}

export async function getTelegramLinkStatus(): Promise<TelegramLinkStatus> {
  const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
  const allowed = hasPermission('customers.edit')
  const { data, error } = await supabase.from('assistant_links').select('linked_at, revoked_at').eq('profile_id', userId).eq('channel', 'telegram').maybeSingle()
  // Tabellen findes kun hvor 00195 er anvendt (staging) — ellers skjules kortet helt (ingen knap der fejler i prod)
  if (error) return { allowed: false, linked: false, linkedAt: null }
  const row = data as { linked_at: string | null; revoked_at: string | null } | null
  return { allowed, linked: !!row?.linked_at && !row.revoked_at, linkedAt: row?.revoked_at ? null : row?.linked_at ?? null }
}

export async function createTelegramLinkCodeAction(): Promise<{ success: boolean; code?: string; ttlMin?: number; error?: string }> {
  const { userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('customers.edit')) return { success: false, error: 'ELTA Assistant er endnu kun åben for kontor-roller' }
  const admin = createAdminClient()
  const { data: p } = await admin.from('profiles').select('is_active').eq('id', userId).maybeSingle()
  if (!(p as { is_active?: boolean } | null)?.is_active) return { success: false, error: 'Din bruger er deaktiveret' }
  try {
    const { code } = await createLinkCode(admin, userId)
    await audit(userId, 'link_code_created')
    return { success: true, code, ttlMin: LINK_CODE_TTL_MIN }
  } catch (e) {
    logger.error('createTelegramLinkCodeAction failed', { error: e })
    return { success: false, error: 'Kunne ikke lave en kode' }
  }
}

export async function revokeTelegramLinkAction(): Promise<{ success: boolean; error?: string }> {
  const { userId } = await getAuthenticatedClientWithRole()
  try {
    const now = new Date().toISOString()
    // kun egen kobling (profile_id = den indloggede bruger) — samme felter som revokeLink()
    const { error } = await createAdminClient()
      .from('assistant_links')
      .update({ revoked_at: now, telegram_chat_id: null, link_code_hash: null, link_code_expires_at: null, updated_at: now })
      .eq('profile_id', userId)
      .eq('channel', 'telegram')
    if (error) throw error
    await audit(userId, 'link_revoked')
    return { success: true }
  } catch (e) {
    logger.error('revokeTelegramLinkAction failed', { error: e })
    return { success: false, error: 'Kunne ikke afbryde forbindelsen' }
  }
}
