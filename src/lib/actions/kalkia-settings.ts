'use server'

import { revalidatePath } from 'next/cache'
import {
  updateKalkiaBuildingProfileSchema,
  updateKalkiaGlobalFactorSchema,
} from '@/lib/validations/kalkia'
import { validateUUID } from '@/lib/validations/common'
import type {
  KalkiaBuildingProfile,
  KalkiaGlobalFactor,
} from '@/types/kalkia.types'
import type { ActionResult } from '@/types/common.types'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
import { logger } from '@/lib/utils/logger'

// =====================================================
// Kalkia Building Profiles
// =====================================================

export async function getBuildingProfiles(): Promise<ActionResult<KalkiaBuildingProfile[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('kalkia_building_profiles')
      .select('*')
      .order('sort_order')

    if (error) {
      logger.error('Database error fetching building profiles', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as KalkiaBuildingProfile[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente bygningsprofiler') }
  }
}

export async function updateBuildingProfile(
  formData: FormData
): Promise<ActionResult<KalkiaBuildingProfile>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Profil ID mangler' }
    }
    validateUUID(id, 'profil ID')

    const rawData = {
      id,
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      time_multiplier: formData.get('time_multiplier') ? Number(formData.get('time_multiplier')) : 1,
      difficulty_multiplier: formData.get('difficulty_multiplier') ? Number(formData.get('difficulty_multiplier')) : 1,
      material_waste_multiplier: formData.get('material_waste_multiplier') ? Number(formData.get('material_waste_multiplier')) : 1,
      overhead_multiplier: formData.get('overhead_multiplier') ? Number(formData.get('overhead_multiplier')) : 1,
      typical_wall_type: formData.get('typical_wall_type') as string || null,
      typical_access: formData.get('typical_access') as string || 'normal',
      is_active: formData.get('is_active') !== 'false',
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
    }

    const validated = updateKalkiaBuildingProfileSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const { id: profileId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('kalkia_building_profiles')
      .update(updateData)
      .eq('id', profileId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Profilen blev ikke fundet' }
      }
      logger.error('Database error updating building profile', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/profiles')
    return { success: true, data: data as KalkiaBuildingProfile }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere bygningsprofil') }
  }
}

// =====================================================
// Kalkia Global Factors
// =====================================================

export async function getGlobalFactors(): Promise<ActionResult<KalkiaGlobalFactor[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('kalkia_global_factors')
      .select('*')
      .order('sort_order')

    if (error) {
      logger.error('Database error fetching global factors', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    return { success: true, data: (data || []) as KalkiaGlobalFactor[] }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente globale faktorer') }
  }
}

export async function updateGlobalFactor(
  formData: FormData
): Promise<ActionResult<KalkiaGlobalFactor>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const id = formData.get('id') as string
    if (!id) {
      return { success: false, error: 'Faktor ID mangler' }
    }
    validateUUID(id, 'faktor ID')

    const rawData = {
      id,
      factor_key: formData.get('factor_key') as string,
      factor_name: formData.get('factor_name') as string,
      description: formData.get('description') as string || null,
      category: formData.get('category') as string,
      value_type: formData.get('value_type') as string,
      value: Number(formData.get('value')),
      min_value: formData.get('min_value') ? Number(formData.get('min_value')) : null,
      max_value: formData.get('max_value') ? Number(formData.get('max_value')) : null,
      is_active: formData.get('is_active') !== 'false',
      sort_order: formData.get('sort_order') ? Number(formData.get('sort_order')) : 0,
    }

    const validated = updateKalkiaGlobalFactorSchema.safeParse(rawData)
    if (!validated.success) {
      const errors = validated.error.errors.map((e) => e.message).join(', ')
      return { success: false, error: errors }
    }

    const { id: factorId, ...updateData } = validated.data

    const { data, error } = await supabase
      .from('kalkia_global_factors')
      .update(updateData)
      .eq('id', factorId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'Faktoren blev ikke fundet' }
      }
      logger.error('Database error updating global factor', { error: error })
      throw new Error('DATABASE_ERROR')
    }

    revalidatePath('/dashboard/settings/kalkia/factors')
    return { success: true, data: data as KalkiaGlobalFactor }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke opdatere faktor') }
  }
}
