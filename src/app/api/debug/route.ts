/**
 * Unprotected debug endpoint to verify what's actually deployed.
 *
 * Returns commit SHA + list of dashboard subroutes that exist at
 * runtime. Hit it directly with curl — no auth required. Used to
 * diagnose the /dashboard/test123 + /dashboard/invoices 404 mystery.
 *
 * Remove after debugging.
 */
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    'unknown'

  // Try to enumerate dashboard subroutes at runtime by inspecting the
  // bundled .next/server/app/dashboard directory.
  let dashboardRoutes: string[] = []
  let listError: string | null = null
  try {
    const tryPaths = [
      path.join(process.cwd(), '.next/server/app/dashboard'),
      path.join('/var/task/.next/server/app/dashboard'),
      path.join('/var/task/apps/web/.next/server/app/dashboard'),
    ]
    for (const p of tryPaths) {
      try {
        const entries = fs.readdirSync(p, { withFileTypes: true })
        dashboardRoutes = entries
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort()
        if (dashboardRoutes.length > 0) break
      } catch { /* try next */ }
    }
  } catch (err) {
    listError = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json(
    {
      commit_sha: commit,
      vercel_env: process.env.VERCEL_ENV ?? null,
      vercel_url: process.env.VERCEL_URL ?? null,
      vercel_deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null,
      vercel_region: process.env.VERCEL_REGION ?? null,
      cwd: process.cwd(),
      dashboard_routes_in_bundle: dashboardRoutes,
      dashboard_route_count: dashboardRoutes.length,
      list_error: listError,
      has_test123: dashboardRoutes.includes('test123'),
      has_invoices: dashboardRoutes.includes('invoices'),
      generated_at: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
