import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

/**
 * Email open tracking endpoint
 * Called when tracking pixel is loaded in email client
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  try {
    const { trackingId } = await params

    // API-5 (API-review 2026-10-19): kun velformede id'er; åbninger dedupliceres (én pr. mail pr. 10 min) og loftes
    // pr. mail — før kunne enhver med linket (videresendt mail, mailscanner) fylde email_events og forfalske "åbnet"
    if (!trackingId || trackingId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(trackingId)) {
      return new NextResponse(TRACKING_PIXEL, {
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      })
    }

    // Use admin client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      // Find message by tracking ID
      const { data: message } = await supabase
        .from('email_messages')
        .select('id')
        .eq('tracking_id', trackingId)
        .single()

      const since = new Date(Date.now() - 10 * 60_000).toISOString()
      const recent = message
        ? (await supabase.from('email_events').select('id', { count: 'exact', head: true })
            .eq('message_id', message.id).eq('event_type', 'opened').gte('occurred_at', since)).count ?? 0
        : 0
      const total = message && recent === 0
        ? (await supabase.from('email_events').select('id', { count: 'exact', head: true })
            .eq('message_id', message.id).eq('event_type', 'opened')).count ?? 0
        : 0
      if (message && recent === 0 && total < 50) {
        // Vercel sætter x-real-ip/x-forwarded-for (første led = klienten); afkortet
        const ip = request.headers.get('x-real-ip') ||
                   request.headers.get('x-forwarded-for') ||
                   'unknown'
        const userAgent = (request.headers.get('user-agent') || 'unknown').slice(0, 300)

        // Log the open event
        await supabase
          .from('email_events')
          .insert({
            message_id: message.id,
            event_type: 'opened',
            ip_address: ip.split(',')[0].trim().slice(0, 64),
            user_agent: userAgent,
          })
      }
    }
  } catch (error) {
    // Don't fail - tracking errors should be silent
    logger.error('Tracking error', { error })
  }

  // Always return the tracking pixel
  return new NextResponse(TRACKING_PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': TRACKING_PIXEL.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
