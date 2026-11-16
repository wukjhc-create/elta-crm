import type { Metadata } from 'next'
import { getUploadLinkState } from '@/lib/actions/upload-links-public'
import { UploadForm } from './upload-form'

export const metadata: Metadata = { title: 'Upload billeder — Elta Solar', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

/**
 * Offentlig engangs-upload (AI-receptionist fase 2). Viser INGEN kundedata — kun om linket kan bruges og hvor mange
 * filer der er tilbage. Filerne bliver interne dokumenter på kunden/sagen og knyttes til henvendelsen.
 */
export default async function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const state = await getUploadLinkState(token)
  return (
    <main className="mx-auto max-w-lg p-6 space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Upload billeder til Elta Solar</h1>
      {state.ok ? (
        <>
          <p className="text-sm text-gray-600">Vælg billeder (JPG, PNG, WEBP, HEIC) eller PDF. Højst {state.remaining} fil(er), max 9 MB samlet pr. upload.</p>
          <UploadForm token={token} remaining={state.remaining} />
        </>
      ) : (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="upload-unavailable">{state.error}</p>
      )}
    </main>
  )
}
