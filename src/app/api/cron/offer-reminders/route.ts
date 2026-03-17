/**
 * Cron Job: Offer Reminders
 *
 * Checks for unanswered offers and sends follow-up emails automatically.
 *
 * Schedule: Daily at 9 AM Copenhagen time
 * Auth: Bearer token via CRON_SECRET env var
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
    // Auth check
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || !authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')
    if (token.length !== CRON_SECRET.length) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const isValid = timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    // Get reminder settings
    const { data: settings } = await supabase
      .from('company_settings')
      .select('reminder_enabled, reminder_interval_days, reminder_max_count, reminder_email_subject')
      .limit(1)
      .maybeSingle()

    const enabled = settings?.reminder_enabled ?? true
    const intervalDays = settings?.reminder_interval_days ?? 3
    const maxCount = settings?.reminder_max_count ?? 3

    if (!enabled) {
      return NextResponse.json({ message: 'Reminders disabled', sent: 0 })
    }

    // Find offers that need reminders
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - intervalDays)

    const { data: pendingOffers, error: fetchError } = await supabase
      .from('offers')
      .select(`
        id, offer_number, title, final_amount, currency, valid_until,
        sent_at, last_reminder_sent, reminder_count, created_by, customer_id,
        customer:customers(company_name, contact_person, email)
      `)
      .in('status', ['sent', 'viewed'])
      .lt('reminder_count', maxCount)
      .or(`last_reminder_sent.is.null,last_reminder_sent.lt.${cutoffDate.toISOString()}`)
      .not('sent_at', 'is', null)
      .lt('sent_at', cutoffDate.toISOString())

    if (fetchError) {
      logger.error('Failed to fetch pending offers for reminders', { error: fetchError })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (!pendingOffers || pendingOffers.length === 0) {
      return NextResponse.json({ message: 'No reminders needed', sent: 0 })
    }

    // Lazy-load email dependencies
    const { isGraphConfigured, getMailbox, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
    const { generateReminderEmailHtml, generateReminderEmailText } = await import('@/lib/email/templates/reminder-email')

    if (!isGraphConfigured()) {
      return NextResponse.json({ error: 'Email not configured' }, { status: 500 })
    }

    const fromEmail = getMailbox()

    let sentCount = 0
    const errors: string[] = []

    for (const offer of pendingOffers) {
      try {
        const customerRaw = offer.customer as unknown
        const customer = (Array.isArray(customerRaw) ? customerRaw[0] : customerRaw) as { company_name: string; contact_person: string; email: string } | null
        if (!customer?.email) continue

        // Check if offer is expired
        if (offer.valid_until && new Date(offer.valid_until) < new Date()) continue

        // Get sender name from employee profile
        let senderName = 'Elta Solar'
        if (offer.created_by) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', offer.created_by)
            .maybeSingle()
          if (profile?.full_name) senderName = profile.full_name
        }

        const { getPortalOfferUrl } = await import('@/lib/utils/portal-link')
        const portalUrl = await getPortalOfferUrl(offer.id, offer.customer_id)
        const reminderCount = (offer.reminder_count || 0) + 1

        const finalAmount = new Intl.NumberFormat('da-DK', {
          style: 'currency',
          currency: offer.currency || 'DKK',
          maximumFractionDigits: 0,
        }).format(offer.final_amount || 0)

        const validUntilFormatted = offer.valid_until
          ? new Date(offer.valid_until).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })
          : null

        const subject = settings?.reminder_email_subject || `Påmindelse: Dit tilbud fra Elta Solar`

        const emailParams = {
          customerName: customer.contact_person || 'Kunde',
          companyName: customer.company_name || '',
          offerNumber: offer.offer_number,
          offerTitle: offer.title,
          finalAmount,
          validUntil: validUntilFormatted,
          portalUrl,
          senderName,
          reminderCount,
        }

        const html = generateReminderEmailHtml(emailParams)
        const text = generateReminderEmailText(emailParams)

        const result = await sendEmailViaGraph({
          to: customer.email,
          subject: `${subject} (${offer.offer_number})`,
          html,
          text,
          senderName,
        })

        if (result.success) {
          // Update offer with reminder tracking
          await supabase
            .from('offers')
            .update({
              last_reminder_sent: new Date().toISOString(),
              reminder_count: reminderCount,
            })
            .eq('id', offer.id)
          sentCount++
        } else {
          errors.push(`${offer.offer_number}: ${result.error}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        errors.push(`${offer.offer_number}: ${msg}`)
        logger.error('Reminder send failed', { error: err, entityId: offer.id })
      }
    }

    logger.info('Offer reminders cron completed', { entityId: `sent:${sentCount}` })

    return NextResponse.json({
      message: `Sent ${sentCount} reminders`,
      sent: sentCount,
      total: pendingOffers.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    logger.error('Offer reminders cron failed', { error: err })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
