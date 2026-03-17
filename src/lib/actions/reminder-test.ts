'use server'

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { isGraphConfigured, getMailbox, sendEmailViaGraph } from '@/lib/services/microsoft-graph'
import { generateReminderEmailHtml, generateReminderEmailText } from '@/lib/email/templates/reminder-email'

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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://elta-crm.vercel.app'

    const emailParams = {
      customerName: senderName,
      companyName: 'Test Firma ApS',
      offerNumber: 'TILBUD-2026-TEST',
      offerTitle: 'Solcelleanlæg 10 kWp (TESTMAIL)',
      finalAmount: '125.000 kr.',
      validUntil: '31. marts 2026',
      portalUrl: `${baseUrl}/view-offer/test`,
      senderName,
      reminderCount: 1,
    }

    const html = generateReminderEmailHtml(emailParams)
    const text = generateReminderEmailText(emailParams)

    const result = await sendEmailViaGraph({
      to: user.email,
      subject: `[TEST] Påmindelse: Dit tilbud fra Elta Solar (TILBUD-2026-TEST)`,
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
