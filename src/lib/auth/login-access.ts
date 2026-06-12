/**
 * Sprint Ø2.2 — central login-adgangsstyring (server-only).
 *
 * Sætter en brugers login-adgang ÉT sted, så alle veje (medarbejderkort +
 * team-settings) håndhæver det ens:
 *   1. Supabase auth-ban  → HÅRD håndhævelse: banned bruger kan ikke logge
 *      ind, og eksisterende sessioner afvises ved næste token-refresh.
 *   2. profiles.is_active → flag til UI + login-flow-gate (defense in depth).
 *
 * Bevidst INGEN per-request middleware (ville genindføre Sprint Performance 1's
 * invocation-problem). Håndhævelsen ligger på auth-laget + ved login.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

// ~100 år = de facto permanent. Supabase forventer en Go-duration-streng.
const PERMANENT_BAN = '876000h'

export async function setProfileLoginActive(
  profileId: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()

  // 1) Auth-ban (hård håndhævelse på selve auth.users)
  const { error: banErr } = await admin.auth.admin.updateUserById(profileId, {
    ban_duration: active ? 'none' : PERMANENT_BAN,
  })
  if (banErr) {
    logger.error('setProfileLoginActive: ban toggle failed', { error: banErr, entityId: profileId })
    return { ok: false, error: banErr.message }
  }

  // 2) profiles.is_active flag (login-flow-gate + UI-visning)
  const { error: updErr } = await admin
    .from('profiles')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', profileId)
  if (updErr) {
    logger.error('setProfileLoginActive: is_active update failed', { error: updErr, entityId: profileId })
    return { ok: false, error: updErr.message }
  }

  return { ok: true }
}
