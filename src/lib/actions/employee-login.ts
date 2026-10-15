'use server'

/**
 * Sprint Ø2.2 — medarbejder ↔ login styring.
 *
 * Knytter en `employees`-række til en auth-bruger (`profiles.id =
 * auth.users.id`) og styrer login-adgang. Auth-rollen (`profiles.role`) er
 * den ENESTE autoritative kilde til adgang (Fase 4); `employees.role` er
 * udelukkende en fag-/HR-klassifikation og bruges aldrig til autorisation.
 *
 * Alle skrivninger kræver `users.edit`/`users.create`. Bruger admin-client
 * (service role) for auth-admin + cross-RLS opslag.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { setProfileLoginActive } from '@/lib/auth/login-access'
import { logEmployeeEvent } from '@/lib/actions/employee-events'
import { isGraphConfigured } from '@/lib/services/microsoft-graph'
import { resetPasswordRedirect, buildSetPasswordLink } from '@/lib/auth/set-password-link'
import { logger } from '@/lib/utils/logger'
import { authErrorText } from '@/lib/auth/auth-error-text'
import { createInviteLink, markInviteSent, sendAccessMail } from '@/lib/auth/access-mail'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import type { UserRole } from '@/types/auth.types'
import { isValidRole, lastAdminBlock } from '@/lib/auth/role-guard'

export interface EmployeeLoginStatus {
  has_login: boolean
  profile_id: string | null
  is_active: boolean | null
  auth_role: UserRole | null
  email: string | null
  last_sign_in_at: string | null
  created_at: string | null
}

export interface LinkableProfile {
  id: string
  full_name: string | null
  email: string | null
  role: UserRole
}

export async function getEmployeeLoginStatus(
  employeeId: string
): Promise<ActionResult<EmployeeLoginStatus>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('users.view')) {
      return { success: false, error: 'Manglende tilladelse: users.view' }
    }
    const admin = createAdminClient()
    const { data: emp } = await admin
      .from('employees')
      .select('id, email, profile_id')
      .eq('id', employeeId)
      .maybeSingle()
    if (!emp) return { success: false, error: 'Medarbejder ikke fundet' }

    if (!emp.profile_id) {
      return {
        success: true,
        data: { has_login: false, profile_id: null, is_active: null, auth_role: null, email: emp.email ?? null, last_sign_in_at: null, created_at: null },
      }
    }

    const { data: prof } = await admin
      .from('profiles')
      .select('id, role, is_active, email')
      .eq('id', emp.profile_id)
      .maybeSingle()

    // Auth-metadata (seneste login, oprettet) fra auth.users.
    let lastSignIn: string | null = null
    let createdAt: string | null = null
    try {
      const { data: au } = await admin.auth.admin.getUserById(emp.profile_id as string)
      lastSignIn = au?.user?.last_sign_in_at ?? null
      createdAt = au?.user?.created_at ?? null
    } catch { /* ikke-kritisk */ }

    return {
      success: true,
      data: {
        has_login: true,
        profile_id: emp.profile_id,
        is_active: prof?.is_active ?? true,
        auth_role: (prof?.role as UserRole) ?? null,
        email: prof?.email ?? emp.email ?? null,
        last_sign_in_at: lastSignIn,
        created_at: createdAt,
      },
    }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente login-status') }
  }
}

export async function listLinkableProfiles(): Promise<ActionResult<LinkableProfile[]>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }
    const admin = createAdminClient()
    // Profiler der IKKE allerede er knyttet til en medarbejder.
    const { data: linked } = await admin.from('employees').select('profile_id').not('profile_id', 'is', null)
    const taken = new Set((linked ?? []).map((r) => r.profile_id as string))
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email, role')
      .order('full_name', { ascending: true })
    const out = (profiles ?? [])
      .filter((p) => !taken.has(p.id as string))
      .map((p) => ({
        id: p.id as string,
        full_name: (p.full_name as string | null) ?? null,
        email: (p.email as string | null) ?? null,
        role: (p.role as UserRole) ?? 'montør',
      }))
    return { success: true, data: out }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke hente brugere') }
  }
}

export async function inviteEmployeeLogin(
  employeeId: string,
  role: UserRole
): Promise<ActionResult<{ profile_id: string }>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('users.create')) {
      return { success: false, error: 'Manglende tilladelse: users.create' }
    }
    // auth-review 2026-10-07: rollen valideres som i de øvrige login-flows (før blev enhver tekst skrevet til profiles.role)
    if (!isValidRole(role)) return { success: false, error: 'Ukendt rolle' }
    const admin = createAdminClient()
    const { data: emp } = await admin
      .from('employees')
      .select('id, email, name, first_name, last_name, profile_id')
      .eq('id', employeeId)
      .maybeSingle()
    if (!emp) return { success: false, error: 'Medarbejder ikke fundet' }
    if (emp.profile_id) return { success: false, error: 'Medarbejderen har allerede et login' }
    if (!emp.email) return { success: false, error: 'Medarbejderen mangler e-mail' }

    const fullName =
      (emp.name as string | null) ||
      [emp.first_name, emp.last_name].filter(Boolean).join(' ').trim() ||
      undefined

    // Henrik 2026-10-15: Graph er primær mailkanal — Supabase genererer kun linket; Supabase-SMTP kun som fallback
    const viaGraph = isGraphConfigured()
    const inviteData = { role, full_name: fullName, invited_by: ctx.userId }
    let newUserId: string
    let inviteLink: string | null = null
    if (viaGraph) {
      const gen = await createInviteLink(admin, emp.email as string, inviteData)
      if (gen.error || !gen.userId || !gen.link) {
        logger.error('inviteEmployeeLogin: invite link failed', { error: gen.error, entityId: employeeId })
        return { success: false, error: authErrorText(gen.error, 'Invitationen kunne ikke oprettes. Prøv igen om lidt.') }
      }
      newUserId = gen.userId
      inviteLink = gen.link
    } else {
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(
        emp.email as string,
        { data: inviteData, redirectTo: resetPasswordRedirect() }
      )
      if (invErr || !invited?.user) {
        logger.error('inviteEmployeeLogin: invite failed', { error: invErr, entityId: employeeId })
        // R-3: dansk tekst (fx "findes allerede" / mail-rate-limit) i stedet for rå Supabase-engelsk
        return { success: false, error: authErrorText(invErr, 'Invitationen kunne ikke sendes. Prøv igen om lidt.') }
      }
      newUserId = invited.user.id
    }

    // Trigger handle_new_user opretter profilen; sæt rolle eksplicit + knyt.
    const { error: roleErr } = await admin
      .from('profiles')
      .update({ role, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', newUserId)
    // fejl logges (før ignoreret); koblingen nedenfor gennemføres stadig, så invitationen ikke efterlades ukoblet
    if (roleErr) logger.error('inviteEmployeeLogin: role update failed', { error: roleErr, entityId: employeeId })
    const { error: linkErr } = await admin
      .from('employees')
      .update({ profile_id: newUserId, updated_at: new Date().toISOString() })
      .eq('id', employeeId)
    if (linkErr) {
      logger.error('inviteEmployeeLogin: link failed', { error: linkErr, entityId: employeeId })
      return { success: false, error: 'Bruger inviteret, men kunne ikke knyttes til medarbejder' }
    }

    revalidatePath(`/dashboard/employees/${employeeId}`)
    if (inviteLink) {
      const sent = await sendAccessMail({ email: emp.email as string, name: fullName ?? null, link: inviteLink, mode: 'invite' })
      if (!sent.success) {
        await admin.auth.admin.updateUserById(newUserId, { user_metadata: { ...inviteData, invite_mail_failed: true } })
        return { success: false, error: 'Login er oprettet og knyttet, men invitationsmailen kunne ikke sendes — brug "Send invitation igen".' }
      }
    }
    const { error: metaErr } = await markInviteSent(admin, newUserId, inviteData, ctx.userId, viaGraph ? 'graph' : 'supabase')
    if (metaErr) logger.warn('inviteEmployeeLogin: invite_sent_at kunne ikke gemmes', { error: metaErr, entityId: employeeId })
    return { success: true, data: { profile_id: newUserId } }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke invitere bruger') }
  }
}

export async function linkExistingProfile(
  employeeId: string,
  profileId: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }
    const admin = createAdminClient()
    const { data: prof } = await admin.from('profiles').select('id').eq('id', profileId).maybeSingle()
    if (!prof) return { success: false, error: 'Bruger ikke fundet' }
    // Sikr at profilen ikke allerede er knyttet til en anden medarbejder.
    const { data: clash } = await admin
      .from('employees')
      .select('id')
      .eq('profile_id', profileId)
      .neq('id', employeeId)
      .maybeSingle()
    if (clash) return { success: false, error: 'Brugeren er allerede knyttet til en anden medarbejder' }

    const { error } = await admin
      .from('employees')
      .update({ profile_id: profileId, updated_at: new Date().toISOString() })
      .eq('id', employeeId)
    if (error) return { success: false, error: 'Kunne ikke knytte bruger' }

    revalidatePath(`/dashboard/employees/${employeeId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke knytte bruger') }
  }
}

export async function setEmployeeLoginActive(
  employeeId: string,
  active: boolean
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }
    const admin = createAdminClient()
    const { data: emp } = await admin.from('employees').select('profile_id').eq('id', employeeId).maybeSingle()
    if (!emp?.profile_id) return { success: false, error: 'Medarbejderen har intet login' }

    const res = await setProfileLoginActive(emp.profile_id as string, active)
    if (!res.ok) return { success: false, error: res.error ?? 'Kunne ikke ændre login-adgang' }

    await logEmployeeEvent({
      employeeId,
      eventType: active ? 'login_activated' : 'login_deactivated',
      title: active ? 'Login aktiveret' : 'Login deaktiveret',
      createdBy: ctx.userId,
    })
    revalidatePath(`/dashboard/employees/${employeeId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke ændre login-adgang') }
  }
}

export async function setEmployeeAuthRole(
  employeeId: string,
  role: UserRole
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }
    const admin = createAdminClient()
    const { data: emp } = await admin.from('employees').select('profile_id').eq('id', employeeId).maybeSingle()
    if (!emp?.profile_id) return { success: false, error: 'Medarbejderen har intet login' }
    // Auth-review: kun kendte roller; den sidste aktive admin kan ikke degraderes
    if (!isValidRole(role)) return { success: false, error: 'Ukendt rolle' }
    const block = await lastAdminBlock(admin, emp.profile_id as string, { role })
    if (block) return { success: false, error: block }

    const { error } = await admin
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', emp.profile_id as string)
    if (error) return { success: false, error: 'Kunne ikke ændre adgangsrolle' }

    await logEmployeeEvent({
      employeeId,
      eventType: 'role_changed',
      title: `Adgangsrolle ændret til ${role}`,
      createdBy: ctx.userId,
    })
    revalidatePath(`/dashboard/employees/${employeeId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke ændre adgangsrolle') }
  }
}

// Kopierbart "sæt adgangskode"-link til admin (fallback når mail er nede).
// Genererer INGEN mail. Linket SKAL behandles som en adgangskode i UI'et og
// har indbygget udløb (styret af Supabase Auth's OTP-udløb).
export async function getEmployeeSetPasswordLink(
  employeeId: string
): Promise<ActionResult<{ link: string; email: string }>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    if (!ctx.hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }
    const admin = createAdminClient()
    const { data: emp } = await admin
      .from('employees')
      .select('email, profile_id')
      .eq('id', employeeId)
      .maybeSingle()
    if (!emp) return { success: false, error: 'Medarbejder ikke fundet' }
    if (!emp.profile_id) return { success: false, error: 'Medarbejderen har intet login endnu' }
    // Auth-review (account takeover): e-mailen til "sæt kode"-linket skal være LOGIN-e-mailen fra Auth for netop denne
    // profil — aldrig profiles.email (som brugeren selv kunne ændre, fx til en admins adresse → linket loggede ind som
    // admin). Kun hvis profilen ikke findes i Auth, bruges medarbejderens e-mail.
    const email = await authEmailForProfile(admin, emp.profile_id as string) ?? (emp.email as string | null)
    if (!email) return { success: false, error: 'Medarbejderen mangler e-mail' }

    const { link, error } = await buildSetPasswordLink(admin, email)
    if (!link) return { success: false, error: error ?? 'Kunne ikke generere link' }
    return { success: true, data: { link, email } }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke generere sæt-kode-link') }
  }
}

// Gensend invitation / send nulstil-adgangskode til en medarbejder DER ALLEREDE
// har et login. Sender via vores egen Microsoft Graph-mail (uafhængig af
// Supabase-SMTP). Er Graph ikke sat op (eller fejler afsendelsen) returneres
// linket som fallback, så admin kan kopiere det manuelt.
export async function sendEmployeeAccessEmail(
  employeeId: string,
  mode: 'invite' | 'reset'
): Promise<ActionResult<{ sent: boolean; link?: string }>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const perm = mode === 'invite' ? 'users.create' : 'users.edit'
    if (!ctx.hasPermission(perm)) {
      return { success: false, error: `Manglende tilladelse: ${perm}` }
    }
    const admin = createAdminClient()
    const { data: emp } = await admin
      .from('employees')
      .select('email, name, first_name, last_name, profile_id')
      .eq('id', employeeId)
      .maybeSingle()
    if (!emp) return { success: false, error: 'Medarbejder ikke fundet' }
    if (!emp.profile_id) {
      return { success: false, error: 'Medarbejderen har intet login endnu — brug Inviter' }
    }
    // Auth-review (account takeover): e-mailen til "sæt kode"-linket skal være LOGIN-e-mailen fra Auth for netop denne
    // profil — aldrig profiles.email (som brugeren selv kunne ændre, fx til en admins adresse → linket loggede ind som
    // admin). Kun hvis profilen ikke findes i Auth, bruges medarbejderens e-mail.
    const email = await authEmailForProfile(admin, emp.profile_id as string) ?? (emp.email as string | null)
    if (!email) return { success: false, error: 'Medarbejderen mangler e-mail' }

    // Gensend til en inviteret, endnu ikke bekræftet bruger: nyt invitationstoken erstatter det gamle (det tidligere
    // link er ikke længere aktivt). Kun for en auth-bruger der faktisk findes — aldrig oprettelse herfra.
    let link: string | null = null
    let linkErr: string | undefined
    let authMeta: Record<string, unknown> | undefined
    if (mode === 'invite') {
      const { data: au } = await admin.auth.admin.getUserById(emp.profile_id as string)
      const authUser = au?.user as { email?: string; email_confirmed_at?: string | null; user_metadata?: Record<string, unknown> } | undefined
      if (authUser?.email && !authUser.email_confirmed_at) {
        authMeta = authUser.user_metadata ?? {}
        const gen = await createInviteLink(admin, authUser.email, authMeta)
        link = gen.link
        if (!link) linkErr = gen.error?.message
      }
    }
    if (!link) {
      const built = await buildSetPasswordLink(admin, email)
      link = built.link
      linkErr = built.error
    }
    if (!link) return { success: false, error: linkErr ?? 'Kunne ikke generere link' }

    const fullName =
      (emp.name as string | null) ||
      [emp.first_name, emp.last_name].filter(Boolean).join(' ').trim() ||
      email

    // Graph ikke opsat → giv admin linket som fallback (ingen mail).
    if (!isGraphConfigured()) {
      return { success: true, data: { sent: false, link } }
    }

    // Fælles, HTML-escapet skabelon (navnet escapes — det var før indsat rå)
    const res = await sendAccessMail({ email, name: fullName, link, mode })
    if (!res.success) {
      // Mail fejlede — giv admin linket som fallback frem for en blind fejl.
      return { success: true, data: { sent: false, link } }
    }
    if (authMeta) {
      const { error: metaErr } = await markInviteSent(admin, emp.profile_id as string, authMeta, ctx.userId, 'graph')
      if (metaErr) logger.warn('sendEmployeeAccessEmail: invite_sent_at kunne ikke gemmes', { error: metaErr, entityId: employeeId })
    }

    await logEmployeeEvent({
      employeeId,
      eventType: mode === 'invite' ? 'invite_resent' : 'password_reset_sent',
      title: mode === 'invite' ? 'Invitation gensendt' : 'Nulstil adgangskode sendt',
      createdBy: ctx.userId,
    })
    revalidatePath(`/dashboard/employees/${employeeId}`)
    return { success: true, data: { sent: true } }
  } catch (e) {
    return { success: false, error: formatError(e, 'Kunne ikke sende mail') }
  }
}

/** Login-e-mail fra Supabase Auth for en profil (profil-id = auth-bruger-id). */
async function authEmailForProfile(admin: ReturnType<typeof createAdminClient>, profileId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(profileId)
  if (error || !data?.user?.email) return null
  return data.user.email
}
