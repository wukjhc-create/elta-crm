/**
 * Henvendelser-retention (fase 3A) — se lib/reception/retention.ts. Standard DRY-RUN (kun antal).
 * IKKE planlagt: ruten står ikke i vercel.json (destruktiv oprydning kræver Henriks godkendelse af politikken).
 */
import { handleReceptionRetention } from '@/lib/reception/retention'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  return handleReceptionRetention(request)
}
