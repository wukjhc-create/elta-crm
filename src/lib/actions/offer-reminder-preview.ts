'use server'

/**
 * O-1 (review 2026-10-16): forhåndsvisning af tilbudsrykkere — hvad cron'en VILLE sende. Sender intet og ændrer
 * ingen tilbud. Kun settings.manage (samme gate som test-rykkeren). Portal-links (indeholder kundens adgangstoken)
 * sendes ALDRIG til browseren — kun om et link findes.
 */
import { getAuthenticatedClientWithRole } from '@/lib/actions/action-helpers'
import { insertAuditRow } from '@/lib/audit/insert-audit-row'
import { logger } from '@/lib/utils/logger'
import type { OfferReminderExclusion } from '@/lib/offers/offer-reminder-plan'

export interface OfferReminderPreviewItem {
  offerId: string
  offerNumber: string | null
  title: string | null
  customerName: string | null
  reminderNumber: number
  recipientEmail: string | null
  recipientName: string | null
  hasPortalLink: boolean
  excluded: OfferReminderExclusion | null
  excludedLabel: string | null
}

export interface OfferReminderPreview {
  generatedAt: string
  live: boolean
  enabledInSettings: boolean
  intervalDays: number
  maxCount: number
  maxPerRun: number
  windowDays: number
  scanned: number
  wouldSend: OfferReminderPreviewItem[]
  excluded: OfferReminderPreviewItem[]
  excludedCounts: Array<{ reason: OfferReminderExclusion; label: string; count: number }>
}

export async function previewOfferRemindersAction(): Promise<{ ok: boolean; data?: OfferReminderPreview; error?: string }> {
  const { userId, hasPermission } = await getAuthenticatedClientWithRole()
  if (!hasPermission('settings.manage')) return { ok: false, error: 'Manglende tilladelse: settings.manage' }
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { planOfferReminders, OFFER_REMINDER_EXCLUSION_LABELS } = await import('@/lib/offers/offer-reminder-plan')
    const plan = await planOfferReminders(createAdminClient())
    const toItem = (i: (typeof plan.wouldSend)[number]): OfferReminderPreviewItem => ({
      offerId: i.offerId,
      offerNumber: i.offerNumber,
      title: i.title,
      customerName: i.customerName,
      reminderNumber: i.reminderNumber,
      recipientEmail: i.recipientEmail,
      recipientName: i.recipientName,
      hasPortalLink: !!i.portalUrl && i.portalUrl.includes('/portal/'),
      excluded: i.excluded,
      excludedLabel: i.excluded ? OFFER_REMINDER_EXCLUSION_LABELS[i.excluded] : null,
    })
    const data: OfferReminderPreview = {
      generatedAt: plan.generatedAt,
      live: plan.live,
      enabledInSettings: plan.rules.enabledInSettings,
      intervalDays: plan.rules.intervalDays,
      maxCount: plan.rules.maxCount,
      maxPerRun: plan.rules.maxPerRun,
      windowDays: plan.rules.windowDays,
      scanned: plan.scanned,
      wouldSend: plan.wouldSend.map(toItem),
      excluded: plan.excluded.map(toItem),
      excludedCounts: (Object.entries(plan.excludedCounts) as Array<[OfferReminderExclusion, number]>)
        .map(([reason, count]) => ({ reason, label: OFFER_REMINDER_EXCLUSION_LABELS[reason], count }))
        .sort((a, b) => b.count - a.count),
    }
    await insertAuditRow({
      user_id: userId, entity_type: 'offer', entity_id: null, entity_name: null,
      action: 'offer_reminder_preview',
      action_description: `Forhåndsvisning af tilbudsrykkere: ${data.wouldSend.length} ville blive sendt (intet sendt)`,
      changes: null,
      metadata: { would_send: data.wouldSend.length, scanned: data.scanned, live: data.live },
    })
    return { ok: true, data }
  } catch (error) {
    logger.error('previewOfferRemindersAction failed', { error })
    return { ok: false, error: 'Forhåndsvisningen kunne ikke beregnes — prøv igen' }
  }
}
