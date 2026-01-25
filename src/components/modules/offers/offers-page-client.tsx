'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { OfferForm } from './offer-form'
import { OffersTable } from './offers-table'
import type { OfferWithRelations } from '@/types/offers.types'

interface OffersPageClientProps {
  offers: OfferWithRelations[]
}

export function OffersPageClient({ offers }: OffersPageClientProps) {
  const [showForm, setShowForm] = useState(false)

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tilbud</h1>
            <p className="text-gray-600 mt-1">
              Opret og administrer salgstilbud
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 font-medium"
          >
            <Plus className="w-4 h-4" />
            Nyt Tilbud
          </button>
        </div>

        <OffersTable offers={offers} />
      </div>

      {showForm && <OfferForm onClose={() => setShowForm(false)} />}
    </>
  )
}
