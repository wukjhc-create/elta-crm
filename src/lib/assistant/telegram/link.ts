/**
 * ELTA Assistant / Telegram (T10) — kobling Telegram-chat ↔ CRM-bruger (tabel assistant_links, 00195).
 *
 * Flow: brugeren genererer en engangskode i CRM (gyldig 10 min, kun hash gemmes) → sender "/start <kode>" til botten
 * → webhooken kobler chatten. Kun aktive CRM-brugere; en deaktiveret bruger mister adgang med det samme (tjekkes ved
 * hver besked). Alt sker med service-rollen fra server-kode; tabellen kan ikke skrives af brugere direkte.
 */
import { createHash, randomInt } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@/types/auth.types'
import type { AssistantActor } from '@/lib/assistant/run-command'

export const LINK_CODE_TTL_MIN = 10
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // uden forvekslelige tegn (0/O, 1/I)

export const hashLinkCode = (code: string) => createHash('sha256').update(code.trim().toUpperCase()).digest('hex')

export function generateLinkCode(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return s
}

/** Ny engangskode for brugeren (erstatter en tidligere ubrugt kode). Returnerer klartekst-koden én gang. */
export async function createLinkCode(admin: SupabaseClient, profileId: string, now: Date = new Date()): Promise<{ code: string; expiresAt: string }> {
  const code = generateLinkCode()
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MIN * 60_000).toISOString()
  const { error } = await admin.from('assistant_links').upsert(
    { profile_id: profileId, channel: 'telegram', link_code_hash: hashLinkCode(code), link_code_expires_at: expiresAt, revoked_at: null, updated_at: now.toISOString() },
    { onConflict: 'profile_id,channel' },
  )
  if (error) throw error
  return { code, expiresAt }
}

export type LinkResult = { ok: true; profileId: string } | { ok: false; reason: 'invalid' | 'expired' | 'inactive' | 'chat_in_use' }

/** Indløs en kode fra en Telegram-chat. */
export async function consumeLinkCode(admin: SupabaseClient, chatId: number, code: string, now: Date = new Date()): Promise<LinkResult> {
  if (!/^[A-Z0-9]{6,12}$/i.test(code.trim())) return { ok: false, reason: 'invalid' }
  const { data } = await admin
    .from('assistant_links')
    .select('id, profile_id, link_code_expires_at, revoked_at')
    .eq('channel', 'telegram')
    .eq('link_code_hash', hashLinkCode(code))
    .maybeSingle()
  const row = data as { id: string; profile_id: string; link_code_expires_at: string | null; revoked_at: string | null } | null
  if (!row || row.revoked_at) return { ok: false, reason: 'invalid' }
  if (!row.link_code_expires_at || new Date(row.link_code_expires_at).getTime() < now.getTime()) return { ok: false, reason: 'expired' }
  const { data: prof } = await admin.from('profiles').select('is_active').eq('id', row.profile_id).maybeSingle()
  if (!(prof as { is_active?: boolean } | null)?.is_active) return { ok: false, reason: 'inactive' }
  const { data: other } = await admin.from('assistant_links').select('profile_id').eq('telegram_chat_id', chatId).is('revoked_at', null).maybeSingle()
  if (other && (other as { profile_id: string }).profile_id !== row.profile_id) return { ok: false, reason: 'chat_in_use' }
  const { error } = await admin
    .from('assistant_links')
    .update({ telegram_chat_id: chatId, linked_at: now.toISOString(), link_code_hash: null, link_code_expires_at: null, updated_at: now.toISOString() })
    .eq('id', row.id)
  if (error) return { ok: false, reason: 'invalid' }
  return { ok: true, profileId: row.profile_id }
}

/** CRM-brugeren bag en Telegram-chat (null = ukendt/afbrudt). Rolle og aktiv-status læses fra CRM ved hvert kald. */
export async function actorForChat(admin: SupabaseClient, chatId: number): Promise<AssistantActor | null> {
  const { data } = await admin.from('assistant_links').select('profile_id').eq('telegram_chat_id', chatId).eq('channel', 'telegram').is('revoked_at', null).maybeSingle()
  const link = data as { profile_id: string } | null
  if (!link) return null
  const { data: p } = await admin.from('profiles').select('id, role, is_active').eq('id', link.profile_id).maybeSingle()
  const prof = p as { id: string; role: UserRole; is_active: boolean | null } | null
  if (!prof) return null
  return { profileId: prof.id, role: prof.role, isActive: !!prof.is_active, channel: 'telegram' }
}

/** Telegram-chatten for en CRM-bruger (til påmindelser) — kun aktive, ikke-afbrudte koblinger. */
export async function chatForProfile(admin: SupabaseClient, profileId: string): Promise<number | null> {
  const { data } = await admin.from('assistant_links').select('telegram_chat_id').eq('profile_id', profileId).eq('channel', 'telegram').is('revoked_at', null).not('telegram_chat_id', 'is', null).maybeSingle()
  const id = (data as { telegram_chat_id: number | string } | null)?.telegram_chat_id
  return id == null ? null : Number(id)
}

export async function revokeLink(admin: SupabaseClient, profileId: string, now: Date = new Date()): Promise<void> {
  await admin.from('assistant_links').update({ revoked_at: now.toISOString(), telegram_chat_id: null, link_code_hash: null, link_code_expires_at: null, updated_at: now.toISOString() }).eq('profile_id', profileId).eq('channel', 'telegram')
}
