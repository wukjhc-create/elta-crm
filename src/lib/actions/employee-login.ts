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
import { logger } from '@/lib/utils/logger'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import type { UserRole } from '@/types/auth.types'

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

    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(
      emp.email as string,
      { data: { role, full_name: fullName, invited_by: ctx.userId } }
    )
    if (invErr || !invited?.user) {
      logger.error('inviteEmployeeLogin: invite failed', { error: invErr, entityId: employeeId })
      return { success: false, error: invErr?.message ?? 'Invitation fejlede' }
    }
    const newUserId = invited.user.id

    // Trigger handle_new_user opretter profilen; sæt rolle eksplicit + knyt.
    await admin
      .from('profiles')
      .update({ role, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', newUserId)
    const { error: linkErr } = await admin
      .from('employees')
      .update({ profile_id: newUserId, updated_at: new Date().toISOString() })
      .eq('id', employeeId)
    if (linkErr) {
      logger.error('inviteEmployeeLogin: link failed', { error: linkErr, entityId: employeeId })
      return { success: false, error: 'Bruger inviteret, men kunne ikke knyttes til medarbejder' }
    }

    revalidatePath(`/dashboard/employees/${employeeId}`)
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
