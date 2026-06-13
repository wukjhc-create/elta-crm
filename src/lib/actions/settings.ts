'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getAuthenticatedClient,
  getAuthenticatedClientWithRole,
  formatError,
} from '@/lib/actions/action-helpers'
import type {
  CompanySettings,
  UpdateCompanySettingsInput,
} from '@/types/company-settings.types'
import type { ActionResult } from '@/types/common.types'
import { MAX_IMAGE_SIZE } from '@/lib/constants'
import type { Profile, UpdateProfileInput, TeamInvitation, NotificationPreferences } from '@/types/settings.types'
import { logger } from '@/lib/utils/logger'
import { getStorageSignedUrlOrNull, SIGNED_URL_TTL } from '@/lib/storage/signed-url'
import { setProfileLoginActive } from '@/lib/auth/login-access'

// Get company settings (singleton)
export async function getCompanySettings(): Promise<ActionResult<CompanySettings>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.view')) {
      return { success: false, error: 'Manglende tilladelse: settings.view' }
    }

    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .maybeSingle()

    if (error) {
      logger.error('Error fetching company settings', { error: error })
      return { success: false, error: 'Kunne ikke hente virksomhedsindstillinger' }
    }

    if (!data) {
      return { success: false, error: 'Virksomhedsindstillinger ikke fundet' }
    }

    return { success: true, data: data as CompanySettings }
  } catch (error) {
    logger.error('Error in getCompanySettings', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update company settings
export async function updateCompanySettings(
  input: UpdateCompanySettingsInput
): Promise<ActionResult<CompanySettings>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.manage')) {
      return { success: false, error: 'Manglende tilladelse: settings.manage' }
    }

    // Get existing settings ID (+ nuværende kostbasis til audit).
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id, time_cost_basis, time_cost_rate')
      .maybeSingle()

    if (!existing) {
      return { success: false, error: 'Kunne ikke finde virksomhedsindstillinger' }
    }

    const { data, error } = await supabase
      .from('company_settings')
      .update(input)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      logger.error('Error updating company settings', { error: error })
      return { success: false, error: 'Kunne ikke opdatere virksomhedsindstillinger' }
    }

    // Sprint Ø2.11 — audit kostbasis-ændring (påvirker kun nye/ændrede timer).
    const basisChanged =
      input.time_cost_basis !== undefined && input.time_cost_basis !== existing.time_cost_basis
    const rateChanged =
      input.time_cost_rate !== undefined && Number(input.time_cost_rate) !== Number(existing.time_cost_rate)
    if (basisChanged || rateChanged) {
      try {
        await supabase.from('audit_logs').insert({
          user_id: userId,
          entity_type: 'company_settings',
          entity_id: existing.id,
          entity_name: 'Timeøkonomi',
          action: 'time_cost_basis_changed',
          action_description: `Kostbasis ændret: ${existing.time_cost_basis ?? '—'} → ${input.time_cost_basis ?? existing.time_cost_basis}${rateChanged ? ` (standardkost ${existing.time_cost_rate ?? '—'} → ${input.time_cost_rate ?? '—'})` : ''}`,
          changes: {
            time_cost_basis: { from: existing.time_cost_basis, to: input.time_cost_basis ?? existing.time_cost_basis },
            time_cost_rate: { from: existing.time_cost_rate, to: input.time_cost_rate ?? existing.time_cost_rate },
          },
          metadata: { note: 'Påvirker kun nye/ændrede time_logs — ikke historiske snapshots.' },
        })
      } catch (e) {
        logger.error('audit time_cost_basis failed', { error: e })
      }
    }

    revalidatePath('/dashboard/settings')
    return { success: true, data: data as CompanySettings }
  } catch (error) {
    logger.error('Error in updateCompanySettings', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get SMTP settings (for internal use only)
export async function getSmtpSettings(): Promise<ActionResult<{
  host: string | null
  port: number | null
  user: string | null
  password: string | null
  fromEmail: string | null
  fromName: string | null
}>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    // SMTP-data inkluderer plaintext password — krav settings.manage (admin).
    if (!hasPermission('settings.manage')) {
      return { success: false, error: 'Manglende tilladelse: settings.manage' }
    }

    const { data, error } = await supabase
      .from('company_settings')
      .select('smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name')
      .maybeSingle()

    if (error) {
      logger.error('Error fetching SMTP settings', { error: error })
      return { success: false, error: 'Kunne ikke hente SMTP indstillinger' }
    }

    if (!data) {
      return { success: false, error: 'SMTP indstillinger ikke konfigureret' }
    }

    return {
      success: true,
      data: {
        host: data.smtp_host,
        port: data.smtp_port,
        user: data.smtp_user,
        password: data.smtp_password,
        fromEmail: data.smtp_from_email,
        fromName: data.smtp_from_name,
      },
    }
  } catch (error) {
    logger.error('Error in getSmtpSettings', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// Profile Actions
// ============================================

// Get current user's profile
export async function getProfile(): Promise<ActionResult<Profile>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      logger.error('Error fetching profile', { error: error })
      return { success: false, error: 'Kunne ikke hente profil' }
    }

    if (!data) {
      return { success: false, error: 'Profil ikke fundet' }
    }

    return { success: true, data: data as Profile }
  } catch (error) {
    logger.error('Error in getProfile', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update current user's profile
export async function updateProfile(
  input: UpdateProfileInput
): Promise<ActionResult<Profile>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      logger.error('Error updating profile', { error: error })
      return { success: false, error: 'Kunne ikke opdatere profil' }
    }

    revalidatePath('/dashboard/settings/profile')
    return { success: true, data: data as Profile }
  } catch (error) {
    logger.error('Error in updateProfile', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// Profile Avatar Actions
// ============================================

export async function uploadProfileAvatar(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const file = formData.get('file') as File
    if (!file) {
      return { success: false, error: 'Ingen fil valgt' }
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Kun PNG, JPEG og WebP er tilladt' }
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return { success: false, error: 'Profilbillede må maksimalt være 2 MB' }
    }

    // Delete old avatar if exists
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle()

    if (currentProfile?.avatar_url) {
      const oldPath = currentProfile.avatar_url.split('/attachments/')[1]
      if (oldPath) {
        await supabase.storage.from('attachments').remove([oldPath])
      }
    }

    const ext = file.name.split('.').pop() || 'png'
    const filePath = `avatars/${userId}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      return { success: false, error: formatError(uploadError, 'Kunne ikke uploade billede') }
    }

    // Phase β.2.2: signed URL (1 år) i stedet for public. Consumer
    // bør refreshe via helper hvis URL'en udloeber.
    const signedUrl = await getStorageSignedUrlOrNull('attachments', filePath, SIGNED_URL_TTL.YEAR)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: signedUrl ?? '', updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (updateError) {
      return { success: false, error: 'Kunne ikke gemme profilbillede' }
    }

    revalidatePath('/dashboard/settings/profile')
    return { success: true, data: { url: signedUrl ?? '' } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Upload af profilbillede fejlede') }
  }
}

export async function deleteProfileAvatar(): Promise<ActionResult<void>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle()

    if (currentProfile?.avatar_url) {
      const filePath = currentProfile.avatar_url.split('/attachments/')[1]
      if (filePath) {
        await supabase.storage.from('attachments').remove([filePath])
      }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (updateError) {
      return { success: false, error: 'Kunne ikke fjerne profilbillede' }
    }

    revalidatePath('/dashboard/settings/profile')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Sletning af profilbillede fejlede') }
  }
}

// ============================================
// Company Logo Actions
// ============================================

export async function uploadCompanyLogo(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.manage')) {
      return { success: false, error: 'Manglende tilladelse: settings.manage' }
    }

    const file = formData.get('file') as File
    if (!file) {
      return { success: false, error: 'Ingen fil valgt' }
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Kun PNG, JPEG, WebP og SVG er tilladt' }
    }

    // Validate file size (2MB max for logos)
    if (file.size > MAX_IMAGE_SIZE) {
      return { success: false, error: 'Logo må maksimalt være 2 MB' }
    }

    // Upload to Supabase Storage
    const ext = file.name.split('.').pop() || 'png'
    const fileName = `company-logo-${Date.now()}.${ext}`
    const filePath = `logos/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      return { success: false, error: formatError(uploadError, 'Kunne ikke uploade logo') }
    }

    // Phase β.2.2: signed URL (1 år) i stedet for public.
    const signedUrl = await getStorageSignedUrlOrNull('attachments', filePath, SIGNED_URL_TTL.YEAR)
    const logoUrl = signedUrl ?? ''

    // Update company_settings
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id, company_logo_url')
      .maybeSingle()

    if (!existing) {
      return { success: false, error: 'Virksomhedsindstillinger ikke fundet' }
    }

    // Delete old logo file if exists
    if (existing.company_logo_url) {
      const oldPath = existing.company_logo_url.split('/attachments/')[1]
      if (oldPath) {
        await supabase.storage.from('attachments').remove([oldPath])
      }
    }

    const { error: updateError } = await supabase
      .from('company_settings')
      .update({ company_logo_url: logoUrl })
      .eq('id', existing.id)

    if (updateError) {
      return { success: false, error: 'Kunne ikke gemme logo URL' }
    }

    revalidatePath('/dashboard/settings')
    return { success: true, data: { url: logoUrl } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Logo upload fejlede') }
  }
}

export async function deleteCompanyLogo(): Promise<ActionResult<void>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('settings.manage')) {
      return { success: false, error: 'Manglende tilladelse: settings.manage' }
    }

    const { data: existing } = await supabase
      .from('company_settings')
      .select('id, company_logo_url')
      .maybeSingle()

    if (!existing) {
      return { success: false, error: 'Virksomhedsindstillinger ikke fundet' }
    }

    // Delete file from storage
    if (existing.company_logo_url) {
      const filePath = existing.company_logo_url.split('/attachments/')[1]
      if (filePath) {
        await supabase.storage.from('attachments').remove([filePath])
      }
    }

    // Clear URL in settings
    const { error: updateError } = await supabase
      .from('company_settings')
      .update({ company_logo_url: null })
      .eq('id', existing.id)

    if (updateError) {
      return { success: false, error: 'Kunne ikke fjerne logo' }
    }

    revalidatePath('/dashboard/settings')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Sletning af logo fejlede') }
  }
}

// ============================================
// Security Actions
// ============================================

// Change password
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Supabase updateUser method for password change
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      logger.error('Error changing password', { error: error })
      if (error.message.includes('password')) {
        return { success: false, error: 'Adgangskoden opfylder ikke kravene' }
      }
      return { success: false, error: 'Kunne ikke ændre adgangskode' }
    }

    return { success: true, data: undefined }
  } catch (error) {
    logger.error('Error in changePassword', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// Team Actions
// ============================================

// Get all team members
export async function getTeamMembers(): Promise<ActionResult<Profile[]>> {
  try {
    const { hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.view')) {
      return { success: false, error: 'Manglende tilladelse: users.view' }
    }

    // Sprint 7E fix — profiles RLS begraenser auth users til at se kun
    // egen profile. Brug admin-client (bypass RLS) for at vise alle
    // brugere i Brugerstyring. Service-role bruges KUN server-side.
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      logger.error('Error fetching team members', { error: error })
      return { success: false, error: 'Kunne ikke hente teammedlemmer' }
    }

    // Berig med auth.users.email naar profile.email er NULL.
    let authEmailMap = new Map<string, string>()
    try {
      const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 200 })
      authEmailMap = new Map(
        (users || []).map((u) => [u.id, u.email ?? ''] as const).filter((x) => x[1])
      )
    } catch {
      // ikke-kritisk
    }

    const enriched = (data ?? []).map((p) => ({
      ...p,
      email: (p.email as string | null) || authEmailMap.get(p.id as string) || null,
    }))

    return { success: true, data: enriched as Profile[] }
  } catch (error) {
    logger.error('Error in getTeamMembers', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update team member (admin only)
export async function updateTeamMember(
  memberId: string,
  input: { role?: string; department?: string; is_active?: boolean }
): Promise<ActionResult<Profile>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }

    // Sprint Ø2.2: is_active håndhæves via central helper (sætter flag OG
    // auth-ban) — ikke som et løst profil-felt. Resten (role/department)
    // opdateres normalt.
    if (input.is_active !== undefined) {
      const res = await setProfileLoginActive(memberId, input.is_active)
      if (!res.ok) {
        return { success: false, error: res.error ?? 'Kunne ikke ændre login-adgang' }
      }
    }

    const rest: { role?: string; department?: string } = {}
    if (input.role !== undefined) rest.role = input.role
    if (input.department !== undefined) rest.department = input.department

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...rest,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .select()
      .single()

    if (error) {
      logger.error('Error updating team member', { error: error })
      return { success: false, error: 'Kunne ikke opdatere teammedlem' }
    }

    revalidatePath('/dashboard/settings/team')
    return { success: true, data: data as Profile }
  } catch (error) {
    logger.error('Error in updateTeamMember', { error: error })
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// =====================================================
// Team Invitations
// =====================================================

export async function inviteTeamMember(
  email: string,
  role: string = 'montør',
): Promise<ActionResult<{ email: string }>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.create')) {
      return { success: false, error: 'Manglende tilladelse: users.create' }
    }

    // Check if user already exists
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existing) {
      return { success: false, error: 'Denne email er allerede registreret' }
    }

    // Check if there's already a pending invite
    const { data: pendingInvite } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingInvite) {
      return { success: false, error: 'Der er allerede en afventende invitation til denne email' }
    }

    // Send invite via Supabase Auth Admin
    const admin = createAdminClient()
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email.toLowerCase(), {
      data: { role, invited_by: userId },
    })

    if (inviteError) {
      logger.error('Error inviting user', { error: inviteError })
      return { success: false, error: 'Kunne ikke sende invitation. Tjek at email er gyldig.' }
    }

    // Store invitation record
    await supabase.from('team_invitations').insert({
      email: email.toLowerCase(),
      role,
      invited_by: userId,
      status: 'pending',
    })

    revalidatePath('/dashboard/settings/team')
    return { success: true, data: { email: email.toLowerCase() } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke sende invitation') }
  }
}

export async function getTeamInvitations(): Promise<ActionResult<TeamInvitation[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.view')) {
      return { success: false, error: 'Manglende tilladelse: users.view' }
    }

    const { data, error } = await supabase
      .from('team_invitations')
      .select('*, inviter:profiles!invited_by(full_name)')
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching invitations', { error: error })
      return { success: false, error: 'Kunne ikke hente invitationer' }
    }

    const invitations: TeamInvitation[] = (data || []).map((inv) => {
      const inviter = inv.inviter as unknown as { full_name: string | null } | null
      return {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        invited_by: inv.invited_by,
        invited_by_name: inviter?.full_name || null,
        created_at: inv.created_at,
        status: inv.status,
      }
    })

    return { success: true, data: invitations }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente invitationer') }
  }
}

export async function cancelInvitation(invitationId: string): Promise<ActionResult<null>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }

    const { error } = await supabase
      .from('team_invitations')
      .delete()
      .eq('id', invitationId)

    if (error) {
      logger.error('Error canceling invitation', { error: error })
      return { success: false, error: 'Kunne ikke annullere invitation' }
    }

    revalidatePath('/dashboard/settings/team')
    return { success: true, data: null }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke annullere invitation') }
  }
}

// ============================================
// Notification Preferences
// ============================================

export async function getNotificationPreferences(): Promise<ActionResult<NotificationPreferences>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      return { success: false, error: 'Kunne ikke hente notifikationspræferencer' }
    }

    if (!data) {
      return { success: false, error: 'Profil ikke fundet' }
    }

    return { success: true, data: (data.notification_preferences as NotificationPreferences) || {} }
  } catch (err) {
    return { success: false, error: formatError(err, 'Fejl ved hentning af notifikationer') }
  }
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences
): Promise<ActionResult<void>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('profiles')
      .update({
        notification_preferences: preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) {
      return { success: false, error: 'Kunne ikke gemme notifikationspræferencer' }
    }

    revalidatePath('/dashboard/settings/notifications')
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: formatError(err, 'Fejl ved gemning af notifikationer') }
  }
}

export async function resendInvitation(invitationId: string): Promise<ActionResult<null>> {
  try {
    const { supabase, userId, hasPermission } = await getAuthenticatedClientWithRole()
    if (!hasPermission('users.edit')) {
      return { success: false, error: 'Manglende tilladelse: users.edit' }
    }

    // Get invitation
    const { data: invitation } = await supabase
      .from('team_invitations')
      .select('email, role')
      .eq('id', invitationId)
      .eq('status', 'pending')
      .maybeSingle()

    if (!invitation) {
      return { success: false, error: 'Invitation ikke fundet' }
    }

    // Resend via Supabase Auth Admin
    const admin = createAdminClient()
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(invitation.email, {
      data: { role: invitation.role, invited_by: userId },
    })

    if (inviteError) {
      logger.error('Error resending invitation', { error: inviteError })
      return { success: false, error: 'Kunne ikke gensende invitation' }
    }

    // Update timestamp
    await supabase
      .from('team_invitations')
      .update({ created_at: new Date().toISOString() })
      .eq('id', invitationId)

    revalidatePath('/dashboard/settings/team')
    return { success: true, data: null }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke gensende invitation') }
  }
}
