import type { Metadata } from 'next'
import { toRelatelNumber, formatPhoneForDisplay } from '@/lib/integrations/relatel/phone'

export const metadata: Metadata = { title: 'Åbn opkald i ELTA CRM', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Dataløs side til Relatels iframe. Den slår ingen kunde op.
 * X-Frame-Options: DENY gælder stadig globalt, så Relatel kan ikke vise siden,
 * før en header-beslutning kun for denne route er godkendt.
 */
export default async function RelatelCtiFrame({ searchParams }: { searchParams: Promise<{ number?: string }> }) {
  const { number } = await searchParams
  const normalized = toRelatelNumber(number)
  const href = normalized ? `/dashboard/cti?number=${normalized}` : null

  return (
    <main className="min-h-screen bg-white text-gray-900 p-6">
      <h1 className="text-lg font-semibold">ELTA CRM</h1>
      <p className="mt-2 text-sm text-gray-600 max-w-md">
        Denne side viser ingen kundedata. Opkaldet åbnes i ELTA CRM, hvor login og rettigheder gælder.
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-flex min-h-11 items-center rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white"
        >
          Åbn {formatPhoneForDisplay(normalized as string)} i ELTA CRM
        </a>
      ) : (
        <p className="mt-6 text-sm text-gray-700">Relatel sendte ikke et brugbart nummer.</p>
      )}
    </main>
  )
}
