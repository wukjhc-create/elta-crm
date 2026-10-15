/**
 * Henrik 2026-10-15 — invitationer via Graph (Supabase genererer kun linket). Staging, INGEN mail sendes
 * (generateLink sender intet; sendAccessMail kaldes ikke).
 *   I1  ny e-mail → auth-bruger + invitationslink
 *   I2  gensend → samme bruger, NYT link
 *   I3  det gamle link (token) er ikke længere aktivt
 *   I4  det nye link virker
 *   I5  markInviteSent: tidspunkt + tæller (1 → 2), mail-fejl-markør nulstilles
 *   I6  24 t-udløb (inviteExpired)
 *   I7  bekræftet bruger kan ikke "geninviteres" (intet nyt invitationslink)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export interface InvCheck { id: string; ok: boolean; note: string }

const tokenOf = (link: string | null) => {
  if (!link) return null
  try { return new URL(link).searchParams.get('token') } catch { return null }
}

export async function runInviteLinkCheck(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<InvCheck[]> {
  const out: InvCheck[] = []
  const { createInviteLink, markInviteSent, inviteExpired } = await import('../../src/lib/auth/access-mail')
  const email = `harness-invite-${randomBytes(4).toString('hex')}@example.com`
  let userId: string | null = null
  try {
    const first = await createInviteLink(c.admin, email, { role: 'montør', invited_by: null })
    userId = first.userId
    out.push({ id: 'I1 ny bruger + link', ok: !!first.userId && !!first.link && !first.error, note: first.error?.message ?? 'ok' })

    const second = await createInviteLink(c.admin, email, { role: 'montør', invited_by: null })
    const t1 = tokenOf(first.link)
    const t2 = tokenOf(second.link)
    out.push({ id: 'I2 gensend: samme bruger, nyt link', ok: second.userId === first.userId && !!t2 && t1 !== t2, note: `samme=${second.userId === first.userId} nyt=${!!t2 && t1 !== t2}` })

    // verifyOtp på token_hash (det action_link selv gør). Hver sin klient — ingen session deles.
    const verify = async (hash: string | null) => {
      if (!hash) return 'mangler token'
      const anon = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      const { error } = await anon.auth.verifyOtp({ type: 'invite', token_hash: hash })
      return error ? (error.code ?? error.message) : 'ok'
    }
    const oldRes = await verify(t1)
    out.push({ id: 'I3 gammelt link afvises', ok: oldRes !== 'ok', note: oldRes })
    const newRes = await verify(t2)
    out.push({ id: 'I4 nyt link virker', ok: newRes === 'ok', note: newRes })

    if (userId) {
      const a = await markInviteSent(c.admin, userId, { role: 'montør', invite_mail_failed: true }, userId, 'graph')
      const b = await markInviteSent(c.admin, userId, a.meta, userId, 'graph')
      const { data: got } = await c.admin.auth.admin.getUserById(userId)
      const m = (got?.user?.user_metadata ?? {}) as Record<string, unknown>
      out.push({
        id: 'I5 sendt-tidspunkt + tæller',
        ok: !a.error && !b.error && m.invite_send_count === 2 && typeof m.invite_sent_at === 'string' && m.invite_mail_failed === false && m.role === 'montør',
        note: `count=${String(m.invite_send_count)} failed=${String(m.invite_mail_failed)}`,
      })
    }

    const now = new Date('2026-10-15T12:00:00Z')
    out.push({
      id: 'I6 udløb efter 24 t',
      ok: inviteExpired('2026-10-14T11:00:00Z', now) && !inviteExpired('2026-10-14T13:00:00Z', now) && !inviteExpired(null, now),
      note: '25 t = udløbet, 23 t = aktiv',
    })

    const third = await createInviteLink(c.admin, email, { role: 'montør' })
    out.push({ id: 'I7 bekræftet bruger kan ikke geninviteres', ok: !third.link && !!third.error, note: third.error?.code ?? third.error?.message ?? 'fik link' })
  } finally {
    if (userId) await c.admin.auth.admin.deleteUser(userId)
  }
  return out
}

export function formatInviteLinkCheck(checks: InvCheck[]): string {
  return ['Invitation (Graph-model) — staging, ingen mail', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id} — ${k.note}`)].join('\n')
}
