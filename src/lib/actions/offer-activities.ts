'use server'

import { createClient, getUser } from '@/lib/supabase/server'
import { getAuthenticatedClient, formatError } from '@/lib/actions/action-helpers'
// Note: getUser is intentionally kept here for optional auth in logOfferActivity/logOfferActivities
// These functions are called from both authenticated and unauthenticated (portal) contexts
import type {
  OfferActivity,
  OfferActivityWithPerformer,
  OfferActivityType,
} from '@/types/offer-activities.types'
import type { ActionResult } from '@/types/common.types'
import { revalidatePath } from 'next/cache'

// Log an activity for an offer
// Uses optional auth because this is called from both
// authenticated dashboard context and unauthenticated portal context
export async function logOfferActivity(
  offerId: string,
  activityType: OfferActivityType,
  description: string,
  performedBy?: string | null,
  metadata?: Record<string, unknown>
): Promise<ActionResult<OfferActivity>> {
  try {
    const supabase = await createClient()

    // If performedBy is not provided, try to get current user
    let userId = performedBy
    if (!userId) {
      const user = await getUser()
      userId = user?.id || null
    }

    const { data, error } = await supabase
      .from('offer_activities')
      .insert({
        offer_id: offerId,
        activity_type: activityType,
        description,
        performed_by: userId,
        metadata: metadata || {},
      })
      .select()
      .single()

    if (error) {
      console.error('Error logging offer activity:', error)
      return { success: false, error: 'Kunne ikke logge aktivitet' }
    }

    revalidatePath('/dashboard/offers')
    return { success: true, data: data as OfferActivity }
  } catch (error) {
    return { success: false, error: formatError(error, 'Kunne ikke logge aktivitet') }
  }
}

// Get all activities for an offer (dashboard only, requires auth)
export async function getOfferActivities(
  offerId: string
): Promise<ActionResult<OfferActivityWithPerformer[]>> {
  try {
    const { supabase } = await getAuthenticatedClient()

    const { data, error } = await supabase
      .from('offer_activities')
      .select(`
        *,
        performer:profiles(id, full_name, email)
      `)
      .eq('offer_id', offerId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching offer activities:', error)
      return { success: false, error: 'Kunne ikke hente aktiviteter' }
    }

    return { success: true, data: data as OfferActivityWithPerformer[] }
  } catch (error) {
    return { success: false, error: formatError(error, 'Kunne ikke hente aktiviteter') }
  }
}

// Log multiple activities at once
// Uses optional auth because this follows the same pattern as logOfferActivity
export async function logOfferActivities(
  activities: {
    offerId: string
    activityType: OfferActivityType
    description: string
    metadata?: Record<string, unknown>
  }[]
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const user = await getUser()
    const userId = user?.id || null

    const activityRecords = activities.map((activity) => ({
      offer_id: activity.offerId,
      activity_type: activity.activityType,
      description: activity.description,
      performed_by: userId,
      metadata: activity.metadata || {},
    }))

    const { error } = await supabase
      .from('offer_activities')
      .insert(activityRecords)

    if (error) {
      console.error('Error logging offer activities:', error)
      return { success: false, error: 'Kunne ikke logge aktiviteter' }
    }

    revalidatePath('/dashboard/offers')
    return { success: true }
  } catch (error) {
    return { success: false, error: formatError(error, 'Kunne ikke logge aktiviteter') }
  }
}
