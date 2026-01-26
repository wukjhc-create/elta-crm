'use server'

import { revalidatePath } from 'next/cache'
import { createClient, getUser } from '@/lib/supabase/server'
import type {
  CompanySettings,
  UpdateCompanySettingsInput,
} from '@/types/company-settings.types'
import type { ActionResult } from '@/types/common.types'

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
    const user = await getUser()
    if (!user) {
      return { success: false, error: 'Du skal være logget ind' }
    }

    const supabase = await createClient()

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
