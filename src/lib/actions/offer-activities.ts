'use server'

import { createClient, getUser } from '@/lib/supabase/server'
import type {
  OfferActivity,
  OfferActivityWithPerformer,
  OfferActivityType,
} from '@/types/offer-activities.types'

export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// Log an activity for an offer
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

    return { success: true, data: data as OfferActivity }
  } catch (error) {
    console.error('Error in logOfferActivity:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Get all activities for an offer
export async function getOfferActivities(
  offerId: string
): Promise<ActionResult<OfferActivityWithPerformer[]>> {
  try {
    const supabase = await createClient()

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
    console.error('Error in getOfferActivities:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}

// Log multiple activities at once
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

    return { success: true }
  } catch (error) {
    console.error('Error in logOfferActivities:', error)
    return { success: false, error: 'Der opstod en fejl' }
  }
}
