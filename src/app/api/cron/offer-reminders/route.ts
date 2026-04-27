/**
 * Cron Job: Auto Follow-up (3-day rule)
 *
 * Checks for unanswered: offers, unsigned fuldmagter, unconfirmed besigtigelser.
 * Sends a friendly follow-up email if no response within 3 days.
 * Stops immediately when status changes to accepted/signed/confirmed.
 *
 * Schedule: Daily at 8 AM (Copenhagen) via Vercel cron
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/utils/logger'
import { BRAND_COMPANY_NAME, BRAND_EMAIL, BRAND_WEBSITE, BRAND_GREEN } from '@/lib/brand'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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

    // Get settings
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

    const { isGraphConfigured, sendEmailViaGraph } = await import('@/lib/services/microsoft-graph')
    if (!isGraphConfigured()) {
      return NextResponse.json({ error: 'Email not configured' }, { status: 500 })
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - intervalDays)
    let totalSent = 0
    const errors: string[] = []

    // ─── 1. OFFER REMINDERS ───
    try {
      const { data: pendingOffers } = await supabase
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

      if (pendingOffers && pendingOffers.length > 0) {
        const { generateReminderEmailHtml, generateReminderEmailText } = await import('@/lib/email/templates/reminder-email')

        for (const offer of pendingOffers) {
          try {
            const customerRaw = offer.customer as unknown
            const customer = (Array.isArray(customerRaw) ? customerRaw[0] : customerRaw) as { company_name: string; contact_person: string; email: string } | null
            if (!customer?.email) continue
            if (offer.valid_until && new Date(offer.valid_until) < new Date()) continue

            let senderName = BRAND_COMPANY_NAME
            if (offer.created_by) {
              const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', offer.created_by).maybeSingle()
              if (profile?.full_name) senderName = profile.full_name
            }

            const { getPortalOfferUrl } = await import('@/lib/utils/portal-link')
            const portalUrl = await getPortalOfferUrl(offer.id, offer.customer_id)
            const reminderCount = (offer.reminder_count || 0) + 1

            const finalAmount = new Intl.NumberFormat('da-DK', {
              style: 'currency', currency: offer.currency || 'DKK', maximumFractionDigits: 0,
            }).format(offer.final_amount || 0)

            const validUntilFormatted = offer.valid_until
              ? new Date(offer.valid_until).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })
              : null

            const subject = settings?.reminder_email_subject || 'Påmindelse: Dit tilbud fra Elta Solar'
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

            const result = await sendEmailViaGraph({
              to: customer.email,
              subject: `${subject} (${offer.offer_number})`,
              html: generateReminderEmailHtml(emailParams),
              text: generateReminderEmailText(emailParams),
              senderName,
            })

            if (result.success) {
              await supabase.from('offers').update({
                last_reminder_sent: new Date().toISOString(),
                reminder_count: reminderCount,
              }).eq('id', offer.id)
              totalSent++
            }
          } catch (err) {
            errors.push(`Tilbud ${offer.offer_number}: ${err instanceof Error ? err.message : 'Fejl'}`)
          }
        }
      }
    } catch (err) {
      errors.push(`Tilbuds-rykkere fejlede: ${err instanceof Error ? err.message : 'Fejl'}`)
    }

    // ─── 2. FULDMAGT REMINDERS ───
    try {
      const { data: pendingFuldmagter } = await supabase
        .from('customer_documents')
        .select('id, customer_id, title, description, created_at, customer:customers(company_name, contact_person, email)')
        .eq('document_type', 'contract')
        .lt('created_at', cutoffDate.toISOString())

      if (pendingFuldmagter && pendingFuldmagter.length > 0) {
        for (const doc of pendingFuldmagter) {
          try {
            const desc = JSON.parse(doc.description || '{}')
            if (desc.type !== 'fuldmagt' || desc.status !== 'pending') continue
            // Only remind once (check if we already reminded)
            if (desc.reminder_sent) continue

            const customerRaw = doc.customer as unknown
            const customer = (Array.isArray(customerRaw) ? customerRaw[0] : customerRaw) as { company_name: string; contact_person: string; email: string } | null
            if (!customer?.email) continue

            const html = buildFollowUpEmail(
              customer.contact_person || customer.company_name,
              'fuldmagt',
              `Vi mangler stadig din underskrift på fuldmagten (ordrenr. ${desc.order_number || ''}).`,
              'Log ind på din kundeportal for at underskrive digitalt — det tager under 1 minut.'
            )

            const result = await sendEmailViaGraph({
              to: customer.email,
              subject: `Påmindelse: Fuldmagt afventer din underskrift — ${BRAND_COMPANY_NAME}`,
              html,
            })

            if (result.success) {
              // Mark as reminded so we don't spam
              desc.reminder_sent = new Date().toISOString()
              await supabase.from('customer_documents').update({
                description: JSON.stringify(desc),
              }).eq('id', doc.id)
              totalSent++
            }
          } catch (err) {
            errors.push(`Fuldmagt ${doc.id}: ${err instanceof Error ? err.message : 'Fejl'}`)
          }
        }
      }
    } catch (err) {
      errors.push(`Fuldmagt-rykkere fejlede: ${err instanceof Error ? err.message : 'Fejl'}`)
    }

    // ─── 3. BESIGTIGELSE CONFIRMATION REMINDERS ───
    try {
      const { data: pendingTasks } = await supabase
        .from('customer_tasks')
        .select('id, customer_id, title, description, created_at, customer:customers(company_name, contact_person, email)')
        .ilike('title', '%esigtigelse%')
        .eq('status', 'pending')
        .lt('created_at', cutoffDate.toISOString())

      if (pendingTasks && pendingTasks.length > 0) {
        for (const task of pendingTasks) {
          try {
            const customerRaw = task.customer as unknown
            const customer = (Array.isArray(customerRaw) ? customerRaw[0] : customerRaw) as { company_name: string; contact_person: string; email: string } | null
            if (!customer?.email) continue

            // Check if we already sent a reminder (use description field)
            const descData = (() => { try { return JSON.parse(task.description || '{}') } catch { return {} } })()
            if (descData.reminder_sent) continue

            const html = buildFollowUpEmail(
              customer.contact_person || customer.company_name,
              'besigtigelse',
              'Vi har endnu ikke modtaget din bekræftelse af besigtigelsestidspunktet.',
              'Log ind på din kundeportal for at bekræfte eller foreslå et nyt tidspunkt.'
            )

            const result = await sendEmailViaGraph({
              to: customer.email,
              subject: `Påmindelse: Bekræft din besigtigelse — ${BRAND_COMPANY_NAME}`,
              html,
            })

            if (result.success) {
              descData.reminder_sent = new Date().toISOString()
              await supabase.from('customer_tasks').update({
                description: JSON.stringify(descData),
              }).eq('id', task.id)
              totalSent++
            }
          } catch (err) {
            errors.push(`Besigtigelse ${task.id}: ${err instanceof Error ? err.message : 'Fejl'}`)
          }
        }
      }
    } catch (err) {
      errors.push(`Besigtigelse-rykkere fejlede: ${err instanceof Error ? err.message : 'Fejl'}`)
    }

    logger.info('Auto follow-up cron completed', { entityId: `sent:${totalSent}` })

    return NextResponse.json({
      message: `Sent ${totalSent} follow-ups`,
      sent: totalSent,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    logger.error('Auto follow-up cron failed', { error: err })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * Build a branded follow-up email.
 */
function buildFollowUpEmail(
  customerName: string,
  type: 'fuldmagt' | 'besigtigelse',
  mainMessage: string,
  ctaMessage: string
): string {
  const typeLabel = type === 'fuldmagt' ? 'Fuldmagt' : 'Besigtigelse'

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${BRAND_GREEN}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Venlig påmindelse — ${typeLabel}</h1>
      </div>
      <div style="padding: 32px; background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #111827;">Kære ${customerName},</p>
        <p style="color: #374151;">${mainMessage}</p>
        <p style="color: #374151;">${ctaMessage}</p>
        <p style="color: #374151; margin-top: 24px;">
          Har du spørgsmål, er du altid velkommen til at kontakte os.
        </p>
        <p style="color: #374151; margin-top: 24px;">
          Med venlig hilsen,<br/>
          <strong>${BRAND_COMPANY_NAME}</strong><br/>
          <span style="color: #6b7280; font-size: 13px;">${BRAND_EMAIL} &bull; ${BRAND_WEBSITE}</span>
        </p>
      </div>
    </div>
  `
}
