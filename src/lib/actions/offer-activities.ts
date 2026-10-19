'use server'

import { getAuthenticatedClient, getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
// AS-1: skrivning af aktiviteter ligger i lib/offers/offer-activity-log.ts (ikke en server action)
import type {
  OfferActivity,
  OfferActivityWithPerformer,
  OfferActivityType,
} from '@/types/offer-activities.types'
import type { ActionResult } from '@/types/common.types'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'

// Get all activities for an offer (dashboard only, requires auth)
export async function getOfferActivities(
  offerId: string
): Promise<ActionResult<OfferActivityWithPerformer[]>> {
  try {
    const { supabase, hasPermission } = await getAuthenticatedClientWithRole()
    // PM3-6 (rettigheds-audit 2026-10-19): kun med offers.view (montør/bogholderi kunne læse enhver tilbudshistorik)
    if (!hasPermission('offers.view')) return { success: false, error: 'Manglende tilladelse: offers.view' }

    const { data, error } = await supabase
      .from('offer_activities')
      .select(`
        *,
        performer:profiles(id, full_name, email)
      `)
      .eq('offer_id', offerId)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Error fetching offer activities', { error: error })
      return { success: false, error: 'Kunne ikke hente aktiviteter' }
    }

    // RBAC-review 2026-10-07: "sendt trods lav DB" gemmer db_percentage/db_threshold i metadata — samme tal som
    // advarslen bevidst skjuler for salg (offers.view.cost_prices)
    const showDb = hasPermission('offers.view.cost_prices')
    const rows = (data as OfferActivityWithPerformer[]).map((r) => {
      const md = (r as { metadata?: Record<string, unknown> | null }).metadata
      if (showDb || !md || !Object.keys(md).some((k) => k.startsWith('db_'))) return r
      return { ...r, metadata: Object.fromEntries(Object.entries(md).filter(([k]) => !k.startsWith('db_'))) }
    })
    return { success: true, data: rows }
  } catch (error) {
    return { success: false, error: formatError(error, 'Kunne ikke hente aktiviteter') }
  }
}

