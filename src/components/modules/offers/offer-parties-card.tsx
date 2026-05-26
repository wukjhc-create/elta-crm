'use client'

/**
 * Sprint 12A Trin 5A — Read-only display of offer sagspartner roles.
 *
 * Compact when billing_mode='same_as_customer' AND all roles equal the
 * primary customer (the common privatkunde case). Expands to show
 * orderer / end_customer / payer when roles differ.
 *
 * Edit affordance comes in Trin 5B.
 */

import Link from 'next/link'
import { Users, Building, User, Wallet, CreditCard } from 'lucide-react'
import { OFFER_BILLING_MODE_LABELS, type OfferBillingMode } from '@/types/offers.types'
import type { OfferParties, OfferPartyCustomer } from '@/lib/actions/offer-parties'

interface OfferPartiesCardProps {
  parties: OfferParties
  primaryCustomer: {
    id: string
    company_name: string | null
    contact_person: string | null
  } | null
}

function billingModeLabel(mode: OfferBillingMode | null): string {
  if (!mode) return OFFER_BILLING_MODE_LABELS.unknown
  return OFFER_BILLING_MODE_LABELS[mode] || OFFER_BILLING_MODE_LABELS.unknown
}

function PartyRow({
  icon,
  label,
  party,
  primaryCustomer,
}: {
  icon: React.ReactNode
  label: string
  party: OfferPartyCustomer | null
  primaryCustomer: OfferPartiesCardProps['primaryCustomer']
}) {
  if (!party) {
    // Role equals primary customer
    return (
      <div className="flex items-start gap-3">
        <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-sm text-gray-700">
            Samme som primær kunde
            {primaryCustomer?.company_name ? ` (${primaryCustomer.company_name})` : ''}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="p-2 bg-gray-100 rounded-lg">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{label}</p>
        <Link
          href={`/dashboard/customers/${party.id}`}
          className="font-medium text-primary hover:underline block truncate"
        >
          {party.company_name || party.contact_person || 'Ukendt kunde'}
        </Link>
        {party.contact_person && party.company_name && (
          <p className="text-sm text-gray-500 truncate">{party.contact_person}</p>
        )}
        {party.customer_number && (
          <p className="text-xs text-gray-400 font-mono">{party.customer_number}</p>
        )}
      </div>
    </div>
  )
}

export function OfferPartiesCard({ parties, primaryCustomer }: OfferPartiesCardProps) {
  if (parties.isAllSameAsCustomer) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold">Sagspartnere</h2>
        </div>
        <p className="text-sm text-gray-600">Standard kundeopsætning</p>
        <p className="text-sm text-gray-500 mt-1">
          Bestiller, slutkunde og betaler er samme som primær kunde
          {primaryCustomer?.company_name ? ` (${primaryCustomer.company_name})` : ''}.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-gray-500" />
        <h2 className="text-lg font-semibold">Sagspartnere</h2>
      </div>
      <div className="space-y-4">
        <PartyRow
          icon={<Building className="w-5 h-5 text-gray-600" />}
          label="Bestiller / ordregiver"
          party={parties.orderer}
          primaryCustomer={primaryCustomer}
        />
        <PartyRow
          icon={<User className="w-5 h-5 text-gray-600" />}
          label="Slutkunde / anlægsejer"
          party={parties.end_customer}
          primaryCustomer={primaryCustomer}
        />
        <PartyRow
          icon={<Wallet className="w-5 h-5 text-gray-600" />}
          label="Betaler"
          party={parties.payer}
          primaryCustomer={primaryCustomer}
        />
        <div className="flex items-start gap-3 pt-2 border-t">
          <div className="p-2 bg-gray-50 rounded-lg">
            <CreditCard className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Betalingsforhold</p>
            <p className="text-sm font-medium text-gray-700">
              {billingModeLabel(parties.billing_mode)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
