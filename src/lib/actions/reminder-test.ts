'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { isGraphConfigured, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import { generateReminderEmailHtml, generateReminderEmailText } from '@/lib/email/templates/reminder-email'
import { APP_URL } from '@/lib/constants'

export async function sendTestReminder(): Promise<{ success: boolean; error?: string; to?: string }> {
  try {
    if (!isGraphConfigured()) {
      return { success: false, error: 'Microsoft Graph er ikke konfigureret. Sæt AZURE_TENANT_ID, AZURE_CLIENT_ID og AZURE_CLIENT_SECRET i Vercel env vars.' }
    }

    const supabase = await createClient()

    // Get current user's email
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return { success: false, error: 'Kunne ikke finde din e-mail adresse. Er du logget ind?' }
    }

    // Get user profile name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    const senderName = profile?.full_name || 'Elta Solar'
    const baseUrl = APP_URL

    // Try to find a real offer to link to (most recent sent/viewed offer)
    const { data: realOffer } = await supabase
      .from('offers')
      .select('id, offer_number, title, final_amount, currency, valid_until, customer_id, customer:customers(company_name, contact_person)')
      .in('status', ['sent', 'viewed', 'draft'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const offerId = realOffer?.id || 'demo'
    const offerNumber = realOffer?.offer_number || 'TILBUD-2026-TEST'
    const offerTitle = realOffer?.title || 'Solcelleanlæg 10 kWp'
    const customerRaw = realOffer?.customer as unknown
    const customer = (Array.isArray(customerRaw) ? customerRaw[0] : customerRaw) as { company_name: string; contact_person: string } | null
    const finalAmountNum = realOffer?.final_amount || 125000
    const finalAmount = new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: realOffer?.currency || 'DKK',
      maximumFractionDigits: 0,
    }).format(finalAmountNum)
    const validUntil = realOffer?.valid_until
      ? new Date(realOffer.valid_until).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })
      : '31. marts 2026'

    // Build portal URL — use token-based portal route if possible
    let portalUrl = `${baseUrl}/view-offer/${offerId}`
    if (realOffer?.customer_id) {
      const { getPortalOfferUrl } = await import('@/lib/utils/portal-link')
      portalUrl = await getPortalOfferUrl(offerId, realOffer.customer_id)
    }

    const emailParams = {
      customerName: customer?.contact_person || senderName,
      companyName: customer?.company_name || 'Test Firma ApS',
      offerNumber,
      offerTitle: `${offerTitle} (TESTMAIL)`,
      finalAmount,
      validUntil,
      portalUrl,
      senderName,
      reminderCount: 1,
    }

    // Log the portal URL for debugging
    logger.info('Test reminder portalUrl', { metadata: { portalUrl, offerId, customerId: realOffer?.customer_id } })

    const html = generateReminderEmailHtml(emailParams)
    const text = generateReminderEmailText(emailParams)

    const result = await sendEmailViaGraph({
      to: user.email,
      subject: `[TEST] Påmindelse: Dit tilbud fra Elta Solar (${offerNumber})`,
      html,
      text,
      senderName,
    })

    if (!result.success) {
      logger.error('Test reminder send failed', { error: result.error })
      return { success: false, error: result.error || 'Kunne ikke sende test-mail' }
    }

    return { success: true, to: user.email }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ukendt fejl'
    logger.error('Test reminder error', { error: err })
    return { success: false, error: msg }
  }
}
