import type { Metadata } from 'next'
import { getConfirmationContext } from '@/lib/actions/document-confirmations'
import { ConfirmClient } from './confirm-client'
import type { PublicConfirmationContext } from '@/types/document-confirmations.types'

export const dynamic = 'force-dynamic'

/**
 * Phase B1 — public bekraeftelses-side.
 *
 * Token-validering sker UDELUKKENDE i getConfirmationContext (server-side
 * via createAdminClient). Klient-component'en faar kun curated view-model
 * — aldrig raw DB-row, aldrig Supabase-klient, aldrig token udover URL.
 */
export const metadata: Metadata = {
  title: 'Bekræft besigtigelsesrapport — Elta Solar',
  description: 'Bekræft din gennemgang af besigtigelsesrapporten.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: 'no-referrer',
}

interface PageProps {
  params: Promise<{ token: string }>
}

const INVALID_CONTEXT: PublicConfirmationContext = {
  state: 'invalid',
  documentTitle: '',
  documentFileName: '',
  pdfUrl: null,
  serviceCase: null,
  recipientRoleLabel: '',
  recipientEmail: '',
  recipientName: null,
  expiresAt: '',
}

export default async function ConfirmBesigtigelsePage({ params }: PageProps) {
  const { token } = await params

  const result = await getConfirmationContext(token)

  // Hvis server action returnerer en fejl (ikke success), behandl som
  // 'invalid' — vi laekker IKKE error-message til public.
  const context: PublicConfirmationContext =
    result.success && result.data ? result.data : INVALID_CONTEXT

  return <ConfirmClient context={context} token={token} />
}
