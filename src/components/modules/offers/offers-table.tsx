'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  FileText,
  Send,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { OfferStatusBadge } from './offer-status-badge'
import { OfferForm } from './offer-form'
import { deleteOffer, updateOfferStatus } from '@/lib/actions/offers'
import { useToast } from '@/components/ui/toast'
import { OFFER_STATUSES, OFFER_STATUS_LABELS, type OfferWithRelations, type OfferStatus } from '@/types/offers.types'
import type { CompanySettings } from '@/types/company-settings.types'

interface OffersTableProps {
  offers: OfferWithRelations[]
  companySettings?: CompanySettings | null
}

export function OffersTable({ offers, companySettings }: OffersTableProps) {
  const router = useRouter()
  const toast = useToast()
  const [editingOffer, setEditingOffer] = useState<OfferWithRelations | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkActing, setIsBulkActing] = useState(false)

  const allSelected = offers.length > 0 && selectedIds.size === offers.length
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(offers.map((o) => o.id)))
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (!confirm(`Er du sikker på, at du vil slette ${selectedIds.size} tilbud?`)) return
    setIsBulkActing(true)
    await Promise.allSettled(Array.from(selectedIds).map((id) => deleteOffer(id)))
    toast.success(`${selectedIds.size} tilbud slettet`)
    setSelectedIds(new Set())
    setIsBulkActing(false)
    router.refresh()
  }

  const handleBulkStatusChange = async (status: OfferStatus) => {
    setIsBulkActing(true)
    await Promise.allSettled(Array.from(selectedIds).map((id) => updateOfferStatus(id, status)))
    toast.success(`${selectedIds.size} tilbud opdateret til ${OFFER_STATUS_LABELS[status]}`)
    setSelectedIds(new Set())
    setIsBulkActing(false)
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Er du sikker på, at du vil slette dette tilbud?')) {
      return
    }

    setDeletingId(id)
    const result = await deleteOffer(id)

    if (result.success) {
      toast.success('Tilbud slettet')
    } else {
      toast.error('Kunne ikke slette tilbud', result.error)
    }

    setDeletingId(null)
    setOpenMenuId(null)
    router.refresh()
  }

  const handleStatusChange = async (id: string, status: OfferStatus) => {
    const result = await updateOfferStatus(id, status)

    if (result.success) {
      toast.success('Status opdateret')
    } else {
      toast.error('Kunne ikke opdatere status', result.error)
    }

    setOpenMenuId(null)
    router.refresh()
  }

  const currency = companySettings?.default_currency || 'DKK'
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (offers.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">Ingen tilbud endnu</h3>
        <p className="text-gray-500">
          Kom i gang ved at oprette dit første tilbud.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Bulk Action Bar */}
      {someSelected && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 mb-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} valgt
          </span>
          <div className="h-4 w-px bg-gray-300" />
          <select
            onChange={(e) => {
              if (e.target.value) handleBulkStatusChange(e.target.value as OfferStatus)
              e.target.value = ''
            }}
            disabled={isBulkActing}
            className="text-sm border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
            defaultValue=""
          >
            <option value="" disabled>Skift status...</option>
            {OFFER_STATUSES.map((s) => (
              <option key={s} value={s}>{OFFER_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button
            onClick={handleBulkDelete}
            disabled={isBulkActing}
            className="text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
          >
            Slet valgte
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700 ml-auto"
          >
            Ryd valg
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="pl-4 pr-2 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                    aria-label="Vælg alle"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tilbud
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kunde / Lead
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Beløb
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gyldig til
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Oprettet
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Handlinger</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {offers.map((offer) => (
                <tr
                  key={offer.id}
                  className={`hover:bg-gray-50 transition-colors ${selectedIds.has(offer.id) ? 'bg-primary/5' : ''}`}
                >
                  <td className="pl-4 pr-2 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(offer.id)}
                      onChange={() => toggleOne(offer.id)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                      aria-label={`Vælg ${offer.title}`}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <Link
                        href={`/dashboard/offers/${offer.id}`}
                        className="font-medium text-gray-900 hover:text-primary"
                      >
                        {offer.title}
                      </Link>
                      <div className="text-sm text-gray-500 font-mono">
                        {offer.offer_number}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {offer.customer ? (
                      <div>
                        <Link
                          href={`/dashboard/customers/${offer.customer.id}`}
                          className="text-sm font-medium text-gray-900 hover:text-primary"
                        >
                          {offer.customer.company_name}
                        </Link>
                        <div className="text-xs text-gray-500">
                          {offer.customer.customer_number}
                        </div>
                      </div>
                    ) : offer.lead ? (
                      <div>
                        <Link
                          href={`/dashboard/leads/${offer.lead.id}`}
                          className="text-sm font-medium text-gray-900 hover:text-primary"
                        >
                          {offer.lead.company_name}
                        </Link>
                        <div className="text-xs text-gray-500">Lead</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <OfferStatusBadge status={offer.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(offer.final_amount)}
                    </div>
                    <div className="text-xs text-gray-500">
                      ekskl. moms: {formatCurrency(offer.total_amount - offer.discount_amount)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {offer.valid_until
                      ? format(new Date(offer.valid_until), 'd. MMM yyyy', {
                          locale: da,
                        })
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(offer.created_at), 'd. MMM yyyy', {
                      locale: da,
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenMenuId(openMenuId === offer.id ? null : offer.id)
                        }
                        className="p-1 hover:bg-gray-100 rounded-full"
                        aria-label="Flere handlinger"
                      >
                        <MoreHorizontal className="w-5 h-5 text-gray-400" />
                      </button>

                      {openMenuId === offer.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border z-20">
                            <div className="py-1">
                              <Link
                                href={`/dashboard/offers/${offer.id}`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <Eye className="w-4 h-4" />
                                Se detaljer
                              </Link>
                              <button
                                onClick={() => {
                                  setEditingOffer(offer)
                                  setOpenMenuId(null)
                                }}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Pencil className="w-4 h-4" />
                                Rediger
                              </button>

                              {offer.status === 'draft' && (
                                <button
                                  onClick={() => handleStatusChange(offer.id, 'sent')}
                                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                                >
                                  <Send className="w-4 h-4" />
                                  Marker som sendt
                                </button>
                              )}

                              {(offer.status === 'sent' || offer.status === 'viewed') && (
                                <>
                                  <button
                                    onClick={() => handleStatusChange(offer.id, 'accepted')}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-green-600 hover:bg-green-50"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                    Marker accepteret
                                  </button>
                                  <button
                                    onClick={() => handleStatusChange(offer.id, 'rejected')}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-orange-600 hover:bg-orange-50"
                                  >
                                    <XCircle className="w-4 h-4" />
                                    Marker afvist
                                  </button>
                                </>
                              )}

                              <button
                                onClick={() => handleDelete(offer.id)}
                                disabled={deletingId === offer.id}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                {deletingId === offer.id ? 'Sletter...' : 'Slet'}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingOffer && (
        <OfferForm
          offer={editingOffer}
          companySettings={companySettings}
          onClose={() => setEditingOffer(null)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  )
}
