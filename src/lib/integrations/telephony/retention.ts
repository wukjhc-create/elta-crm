/**
 * Telefoni-retention (kaldes af /api/cron/telephony-retention). Bevidst IKKE 'use server'.
 * Cron: 90-dages oprydning af UBEKRÆFTEDE opkald (00247, låst beslutning 3).
 *
 * Sletter kun telephony_calls med customer_id IS NULL (ukendt, forslag, tvetydig, afvist) hvis seneste aktivitet er
 * ældre end 90 dage — reglen ligger i databasen (telephony_purge_unconfirmed, kun service_role); hændelser følger med
 * via kaskade. Bekræftede opkald røres ikke. Uden 00247 (fx prod i dag) → 200 skipped.
 *
 * IKKE planlagt: ruten står ikke i vercel.json. Planlægning kræver Henriks godkendelse (sammen med prod-00247).
 */
import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/security/safe-equal'
import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTelephonySchema } from '@/lib/integrations/telephony/persist'
import { logger } from '@/lib/utils/logger'

export async function handleTelephonyRetention(request: Request, env: Record<string, string | undefined> = process.env): Promise<Response> {
  const secret = env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || !auth || !auth.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = auth.slice('Bearer '.length)
  if (token.length !== secret.length || !safeEqual(token, secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await createAdminClient().rpc('telephony_purge_unconfirmed')
  if (isMissingTelephonySchema(error)) return NextResponse.json({ success: true, skipped: true, reason: 'telefoni-tabellerne findes ikke' })
  if (error) {
    logger.error('telephony-retention: oprydning fejlede', { metadata: { code: error.code } })
    return NextResponse.json({ success: false, error: 'Oprydning fejlede' }, { status: 500 })
  }
  return NextResponse.json({ success: true, deleted: typeof data === 'number' ? data : Number(data ?? 0) })
}
