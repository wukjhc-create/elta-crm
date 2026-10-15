/**
 * Henrik 2026-10-15 (pilot-model): invitationer og adgangsmails sendes via Microsoft Graph (kontakt@) — Supabase Auth
 * genererer kun linket (generateLink, ingen Supabase-SMTP), så masse-onboarding ikke rammer Supabases mailgrænse.
 * Bevidst IKKE 'use server' — kaldes fra gatede server actions med admin-klienten.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isGraphConfigured, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import { escapeHtml } from '@/lib/utils/html-escape'
import { resetPasswordRedirect } from '@/lib/auth/set-password-link'

/** Invitationer regnes som udløbet efter 24 t (Supabase Auth "Email OTP expiry" skal stå til 86400 s) */
export const INVITE_TTL_HOURS = 24

export function inviteExpired(lastSentAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastSentAt) return false
  return now.getTime() - new Date(lastSentAt).getTime() > INVITE_TTL_HOURS * 3_600_000
}

export { isGraphConfigured }

/**
 * Invitationslink (sender ingen mail). Ny e-mail → auth-brugeren oprettes. Allerede inviteret, ikke bekræftet bruger
 * (gensend) → GoTrue genbruger brugeren og udsteder et NYT bekræftelsestoken, som erstatter det gamle — det tidligere
 * link er derefter ikke aktivt. Bekræftede brugere afvises af Supabase (email_exists).
 */
export async function createInviteLink(
  admin: SupabaseClient,
  email: string,
  data: Record<string, unknown>,
): Promise<{ userId: string | null; link: string | null; error: { code?: string; message?: string } | null }> {
  const res = await admin.auth.admin.generateLink({ type: 'invite', email, options: { data, redirectTo: resetPasswordRedirect() } })
  const d = res.data as { user?: { id?: string }; properties?: { action_link?: string } } | null
  if (res.error || !d?.properties?.action_link) {
    return { userId: null, link: null, error: (res.error ?? { message: 'Kunne ikke generere invitationslink' }) as { code?: string; message?: string } }
  }
  return { userId: d.user?.id ?? null, link: d.properties.action_link, error: null }
}

/** Gemmer seneste afsendelse på auth-brugeren (user_metadata) — vises som status i Team; ingen migration */
export async function markInviteSent(admin: SupabaseClient, userId: string, existing: Record<string, unknown> | undefined, sentBy: string, channel: 'graph' | 'supabase') {
  const prevCount = Number(existing?.invite_send_count ?? 0)
  const meta = { ...(existing ?? {}), invite_mail_failed: false, invite_sent_at: new Date().toISOString(), invite_sent_by: sentBy, invite_channel: channel, invite_send_count: (Number.isFinite(prevCount) ? prevCount : 0) + 1 }
  const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: meta })
  return { error, meta }
}

export async function sendAccessMail(input: { email: string; name: string | null; link: string; mode: 'invite' | 'reset' }): Promise<{ success: boolean; error?: string }> {
  if (!isGraphConfigured()) return { success: false, error: 'Mail-afsendelse (Microsoft Graph) er ikke sat op' }
  const subject = input.mode === 'invite' ? 'Aktivér din adgang til ELTA Drift' : 'Nulstil din adgangskode til ELTA Drift'
  const intro = input.mode === 'invite'
    ? `Du er oprettet som bruger i ELTA Drift. Klik på knappen for at sætte din adgangskode og logge ind. Linket gælder i ${INVITE_TTL_HOURS} timer.`
    : 'Der er anmodet om nulstilling af din adgangskode til ELTA Drift. Klik på knappen for at sætte en ny adgangskode.'
  const name = escapeHtml(input.name?.trim() || input.email)
  const link = escapeHtml(input.link)
  const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
        <h2 style="font-size:18px;margin:0 0 12px">${subject}</h2>
        <p style="color:#374151">Hej ${name},</p>
        <p style="color:#374151">${intro}</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#166534;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">Sæt adgangskode</a>
        </p>
        <p style="color:#6b7280;font-size:13px">Linket er personligt. Virker knappen ikke, så kopiér denne adresse ind i browseren:</p>
        <p style="color:#6b7280;font-size:12px;word-break:break-all">${link}</p>
      </div>`
  const res = await sendEmailViaGraph({ to: input.email, subject, html })
  return res.success ? { success: true } : { success: false, error: 'Mailen kunne ikke sendes' }
}
