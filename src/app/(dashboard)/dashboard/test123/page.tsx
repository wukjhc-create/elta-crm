/**
 * TEMPORARY route-resolution control for the /dashboard/incoming-invoices
 * 404 investigation.
 *
 * If THIS page loads at /dashboard/test123 in prod but
 * /dashboard/incoming-invoices does not, the issue is in that page's
 * code (server action throwing → error UI / 404 cascade).
 *
 * If THIS page also 404s, the issue is route group / deploy-side and
 * the file structure is being ignored by Vercel.
 *
 * DELETE THIS FILE once the bug is solved.
 */
export const dynamic = 'force-dynamic'

export default function Test123Page() {
  console.log('TEST123 PAGE RENDERED:', new Date().toISOString())
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">/dashboard/test123 — route registration probe</h1>
      <p className="text-sm text-gray-600 mt-2">
        Hvis denne side loader, virker route group + layout. Hvis
        /dashboard/incoming-invoices stadig 404er, er det inde i den side.
      </p>
      <p className="text-xs text-gray-400 mt-4">
        Bygget på {new Date().toISOString()}.
      </p>
    </div>
  )
}
