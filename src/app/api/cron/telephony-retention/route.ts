/**
 * Cron: 90-dages oprydning af UBEKRÆFTEDE opkald (00247) — se lib/integrations/telephony/retention.ts.
 * IKKE planlagt: ruten står ikke i vercel.json (kræver Henriks godkendelse sammen med prod-00247).
 */
import { handleTelephonyRetention } from '@/lib/integrations/telephony/retention'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  return handleTelephonyRetention(request)
}
