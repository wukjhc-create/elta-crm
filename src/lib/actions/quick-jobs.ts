'use server'

import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/common.types'
import type { QuickJob, CalibrationPreset } from '@/types/quick-jobs.types'
import { formatError, getAuthenticatedClient } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

// =====================================================
// HELPER FUNCTIONS
// =====================================================
// =====================================================
// QUICK JOBS
// =====================================================

export async function getQuickJobs(options?: {
  category?: string
  featured_only?: boolean
}): Promise<ActionResult<QuickJob[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    let query = supabase
      .from('quick_jobs')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (options?.category) {
      query = query.eq('category', options.category)
    }

    if (options?.featured_only) {
      query = query.eq('is_featured', true)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Database error fetching quick jobs', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente hurtige jobs') }
  }
}

export async function getQuickJob(id: string): Promise<ActionResult<QuickJob>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('quick_jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Job ikke fundet' }
      }
      logger.error('Database error fetching quick job', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente job') }
  }
}

export async function incrementQuickJobUsage(id: string): Promise<ActionResult<void>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { error } = await supabase.rpc('increment_quick_job_usage', { job_id: id })

    if (error) {
      // Fallback to manual update if RPC doesn't exist
      await supabase
        .from('quick_jobs')
        .update({ usage_count: supabase.rpc('increment', { row_id: id }) })
        .eq('id', id)
    }

    return { success: true }
  } catch (err) {
    // Non-critical, don't fail
    logger.error('Could not increment usage', { error: err })
    return { success: true }
  }
}

// =====================================================
// CALIBRATION PRESETS
// =====================================================

export async function getCalibrationPresets(): Promise<ActionResult<CalibrationPreset[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calibration_presets')
      .select('*')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('category')
      .order('name')

    if (error) {
      logger.error('Database error fetching calibration presets', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: data || [] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kalibreringsprofiler') }
  }
}

export async function getCalibrationPreset(id: string): Promise<ActionResult<CalibrationPreset>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calibration_presets')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Profil ikke fundet' }
      }
      logger.error('Database error fetching calibration preset', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente kalibreringsprofil') }
  }
}

export async function getDefaultCalibrationPreset(): Promise<ActionResult<CalibrationPreset | null>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calibration_presets')
      .select('*')
      .eq('is_default', true)
      .eq('is_active', true)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: true, data: null }
      }
      logger.error('Database error fetching default preset', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente standard profil') }
  }
}

export async function createCalibrationPreset(input: {
  name: string
  description?: string
  category?: string
  factor_overrides: Record<string, number>
  hourly_rate?: number
  margin_percentage?: number
  default_building_profile_id?: string
}): Promise<ActionResult<CalibrationPreset>> {
  try {
    const { supabase, userId } = await getAuthenticatedClient()

    // Generate unique code
    const code = `CAL-${Date.now().toString(36).toUpperCase()}`

    const { data, error } = await supabase
      .from('calibration_presets')
      .insert({
        code,
        name: input.name,
        description: input.description || null,
        category: input.category || 'custom',
        factor_overrides: input.factor_overrides,
        hourly_rate: input.hourly_rate || null,
        margin_percentage: input.margin_percentage || null,
        default_building_profile_id: input.default_building_profile_id || null,
        created_by: userId,
      })
      .select()
      .single()

    if (error) {
      logger.error('Database error creating calibration preset', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke oprette kalibreringsprofil') }
  }
}

export async function updateCalibrationPreset(
  id: string,
  input: Partial<{
    name: string
    description: string
    category: string
    factor_overrides: Record<string, number>
    hourly_rate: number
    margin_percentage: number
    default_building_profile_id: string
    is_active: boolean
  }>
): Promise<ActionResult<CalibrationPreset>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('calibration_presets')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Profil ikke fundet' }
      }
      logger.error('Database error updating calibration preset', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    return { success: true, data }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere kalibreringsprofil') }
  }
}

export async function deleteCalibrationPreset(id: string): Promise<ActionResult<void>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { error } = await supabase
      .from('calibration_presets')
      .delete()
      .eq('id', id)

    if (error) {
      logger.error('Database error deleting calibration preset', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia')
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke slette kalibreringsprofil') }
  }
}
