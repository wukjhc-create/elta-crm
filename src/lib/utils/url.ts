import { APP_URL } from '@/lib/constants'

/**
 * Get the resolved app URL (production-safe).
 * Always returns the production URL when running on Vercel.
 */
export function getAppUrl(): string {
  return APP_URL
}
