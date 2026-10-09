/**
 * Hvilken version kører i prod? Kun den korte commit-SHA (Vercels egen VERCEL_GIT_COMMIT_SHA) — ingen hemmeligheder.
 * Bruges til at bekræfte at en bestemt commit er deployet før prod-gates (fx 00209: server-side storage-kode live).
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'unknown'
  return NextResponse.json({ commit: sha }, { headers: { 'cache-control': 'no-store' } })
}
