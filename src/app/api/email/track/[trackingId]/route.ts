import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    if (!trackingId) {
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

      if (message) {
        // Get request metadata
        const ip = request.headers.get('x-forwarded-for') ||
                   request.headers.get('x-real-ip') ||
                   'unknown'
        const userAgent = request.headers.get('user-agent') || 'unknown'

        // Log the open event
        await supabase
          .from('email_events')
          .insert({
            message_id: message.id,
            event_type: 'opened',
            ip_address: ip.split(',')[0].trim(),
            user_agent: userAgent,
          })
      }
    }
  } catch (error) {
    // Don't fail - tracking errors should be silent
    console.error('Tracking error:', error)
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
