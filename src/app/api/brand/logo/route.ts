import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

// Whitelist af tilladte content-types udledt af fil-endelse. SVG er
// bevidst UDELADT (uploads afviser SVG) — servering af user-uploadet SVG
// er en XSS-vektor.
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/**
 * Stabil, offentlig app-route der serverer firmalogoet.
 *
 * Sikkerhed:
 *   - Tager INGEN parametre. Stien slaas 100% op server-side fra
 *     company_settings.company_logo_storage_path (intet brugerinput).
 *   - Kun stier med 'logos/'-prefix accepteres (+ traversal-guard).
 *   - Filen laeses via service-role fra den PRIVATE attachments-bucket;
 *     bucket forbliver privat.
 *   - nosniff + restriktiv CSP paa svaret.
 */
export async function GET() {
  try {
    const admin = createAdminClient()

    const { data: settings } = await admin
      .from('company_settings')
      .select('company_logo_storage_path')
      .limit(1)
      .maybeSingle()

    const path = settings?.company_logo_storage_path
    if (
      !path ||
      typeof path !== 'string' ||
      !path.startsWith('logos/') ||
      path.includes('..')
    ) {
      return new NextResponse(null, { status: 404 })
    }

    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const contentType = MIME_BY_EXT[ext]
    if (!contentType) {
      // Ukendt/ikke-tilladt endelse — servér ikke.
      return new NextResponse(null, { status: 404 })
    }

    const { data: blob, error } = await admin.storage.from('attachments').download(path)
    if (error || !blob) {
      return new NextResponse(null, { status: 404 })
    }

    const buffer = new Uint8Array(await blob.arrayBuffer())

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      },
    })
  } catch (err) {
    logger.error('brand/logo route failed', { error: err })
    return new NextResponse(null, { status: 404 })
  }
}
