import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { webChatEnabled } from '@/lib/reception/flags'
import { WebChatTest } from './webchat-test'

export const metadata: Metadata = { title: 'Chat (test)', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Fase 3A — test-side for ELTAs web-chat (STAGING). Findes ikke (404) medmindre RECEPTION_WEBCHAT_ENABLED=true.
 * Ikke linket fra noget sted, noindex. Den offentlige widget (trin E) er ikke bygget.
 */
export default function WebChatTestPage() {
  if (!webChatEnabled()) notFound()
  return (
    <main className="mx-auto max-w-lg p-4">
      <h1 className="mb-1 text-lg font-semibold text-gray-900">Elta Solar — chat (testversion)</h1>
      <p className="mb-4 text-xs text-gray-500">Testmiljø. Der sendes ingen SMS eller mail. Svar gives af en automatisk assistent; en medarbejder følger op.</p>
      <WebChatTest needsKey={!!(process.env.RECEPTION_WEBCHAT_TEST_KEY ?? '').trim()} />
    </main>
  )
}
