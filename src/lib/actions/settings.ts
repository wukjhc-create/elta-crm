'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import type {
  CompanySettings,
  UpdateCompanySettingsInput,
} from '@/types/company-settings.types'
import type { ActionResult } from '@/types/common.types'

// Profile types
export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  phone: string | null
  department: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UpdateProfileInput {
  full_name?: string
  phone?: string
  department?: string
  avatar_url?: string
}

// Get company settings (singleton)
export async function getCompanySettings(): Promise<ActionResult<CompanySettings>> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .single()

    if (error) {
      console.error('Error fetching company settings:', error)
      return { success: false, error: 'Kunne ikke hente virksomhedsindstillinger' }
    }

    return { success: true, data: data as CompanySettings }
  } catch (error) {
    console.error('Error in getCompanySettings:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update company settings
export async function updateCompanySettings(
  input: UpdateCompanySettingsInput
): Promise<ActionResult<CompanySettings>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Get existing settings ID
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id')
      .single()

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
      console.error('Error updating company settings:', error)
      return { success: false, error: 'Kunne ikke opdatere virksomhedsindstillinger' }
    }

    revalidatePath('/dashboard/settings')
    return { success: true, data: data as CompanySettings }
  } catch (error) {
    console.error('Error in updateCompanySettings:', error)
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
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('company_settings')
      .select('smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name')
      .single()

    if (error) {
      console.error('Error fetching SMTP settings:', error)
      return { success: false, error: 'Kunne ikke hente SMTP indstillinger' }
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
    console.error('Error in getSmtpSettings:', error)
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
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      return { success: false, error: 'Kunne ikke hente profil' }
    }

    return { success: true, data: data as Profile }
  } catch (error) {
    console.error('Error in getProfile:', error)
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
      console.error('Error updating profile:', error)
      return { success: false, error: 'Kunne ikke opdatere profil' }
    }

    revalidatePath('/dashboard/settings/profile')
    return { success: true, data: data as Profile }
  } catch (error) {
    console.error('Error in updateProfile:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// Company Logo Actions
// ============================================

export async function uploadCompanyLogo(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (profile?.role !== 'admin') {
      return { success: false, error: 'Kun administratorer kan uploade logo' }
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
    if (file.size > 2 * 1024 * 1024) {
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

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath)

    const publicUrl = urlData.publicUrl

    // Update company_settings
    const { data: existing } = await supabase
      .from('company_settings')
      .select('id, company_logo_url')
      .single()

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
      .update({ company_logo_url: publicUrl })
      .eq('id', existing.id)

    if (updateError) {
      return { success: false, error: 'Kunne ikke gemme logo URL' }
    }

    revalidatePath('/dashboard/settings')
    return { success: true, data: { url: publicUrl } }
  } catch (err) {
    return { success: false, error: formatError(err, 'Logo upload fejlede') }
  }
}

export async function deleteCompanyLogo(): Promise<ActionResult<void>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (profile?.role !== 'admin') {
      return { success: false, error: 'Kun administratorer kan slette logo' }
    }

    const { data: existing } = await supabase
      .from('company_settings')
      .select('id, company_logo_url')
      .single()

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
      console.error('Error changing password:', error)
      if (error.message.includes('password')) {
        return { success: false, error: 'Adgangskoden opfylder ikke kravene' }
      }
      return { success: false, error: 'Kunne ikke ændre adgangskode' }
    }

    return { success: true, data: undefined }
  } catch (error) {
    console.error('Error in changePassword:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// ============================================
// Team Actions
// ============================================

// Get all team members
export async function getTeamMembers(): Promise<ActionResult<Profile[]>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching team members:', error)
      return { success: false, error: 'Kunne ikke hente teammedlemmer' }
    }

    return { success: true, data: data as Profile[] }
  } catch (error) {
    console.error('Error in getTeamMembers:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Update team member (admin only)
export async function updateTeamMember(
  memberId: string,
  input: { role?: string; department?: string; is_active?: boolean }
): Promise<ActionResult<Profile>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Check if current user is admin
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (currentProfile?.role !== 'admin') {
      return { success: false, error: 'Kun administratorer kan ændre teammedlemmer' }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .select()
      .single()

    if (error) {
      console.error('Error updating team member:', error)
      return { success: false, error: 'Kunne ikke opdatere teammedlem' }
    }

    revalidatePath('/dashboard/settings/team')
    return { success: true, data: data as Profile }
  } catch (error) {
    console.error('Error in updateTeamMember:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
