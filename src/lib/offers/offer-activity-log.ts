/**
 * AS-1 (sikkerheds-review 2026-10-18): tilbudsaktivitet skrives KUN server-side. Før var logOfferActivity en eksporteret
 * server action i en 'use server'-fil uden gate — enhver indlogget kunne kalde den direkte med en kollegas profil-id som
 * performedBy og en vilkårlig type ("accepted"), så tilbuddets historik viste handlinger personen aldrig foretog.
 * Bevidst IKKE 'use server' (som system-alerts-admin.ts) — kan ikke kaldes fra klienten.
 */
import { createClient, getUser } from '@/lib/supabase/server'
import { formatError } from '@/lib/actions/action-helpers'
import type { OfferActivity, OfferActivityType } from '@/types/offer-activities.types'
import type { ActionResult } from '@/types/common.types'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'

export async function logOfferActivity(
  offerId: string,
  activityType: OfferActivityType,
  description: string,
  performedBy?: string | null,
  metadata?: Record<string, unknown>
): Promise<ActionResult<OfferActivity>> {
  try {
    const supabase = await createClient()
    let userId = performedBy
    if (!userId) {
      const user = await getUser()
      userId = user?.id || null
    }
    const { data, error } = await supabase
      .from('offer_activities')
      .insert({ offer_id: offerId, activity_type: activityType, description, performed_by: userId, metadata: metadata || {} })
      .select()
      .single()
    if (error) {
      logger.error('Error logging offer activity', { error: error })
      return { success: false, error: 'Kunne ikke logge aktivitet' }
    }
    revalidatePath('/dashboard/offers')
    return { success: true, data: data as OfferActivity }
  } catch (error) {
    return { success: false, error: formatError(error, 'Kunne ikke logge aktivitet') }
  }
}
