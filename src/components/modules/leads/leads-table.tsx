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
  Mail,
  Phone,
} from 'lucide-react'
import { LeadStatusBadge } from './lead-status-badge'
import { LeadForm } from './lead-form'
import { deleteLead } from '@/lib/actions/leads'
import { useToast } from '@/components/ui/toast'
import { LEAD_SOURCE_LABELS, type LeadWithRelations } from '@/types/leads.types'

interface LeadsTableProps {
  leads: LeadWithRelations[]
}

export function LeadsTable({ leads }: LeadsTableProps) {
  const router = useRouter()
  const toast = useToast()
  const [editingLead, setEditingLead] = useState<LeadWithRelations | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Er du sikker på, at du vil slette denne lead?')) {
      return
    }

    setDeletingId(id)
    const result = await deleteLead(id)

    if (result.success) {
      toast.success('Lead slettet')
    } else {
      toast.error('Kunne ikke slette lead', result.error)
    }

    setDeletingId(null)
    setOpenMenuId(null)
    router.refresh()
  }

  const formatValue = (value: number | null) => {
    if (value === null) return '-'
    return new Intl.NumberFormat('da-DK', {
      style: 'currency',
      currency: 'DKK',
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Mail className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">Ingen leads endnu</h3>
        <p className="text-gray-500">
          Kom i gang ved at oprette din første lead.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Firma / Kontakt
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kilde
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Værdi
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tildelt
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
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div>
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="font-medium text-gray-900 hover:text-primary"
                      >
                        {lead.company_name}
                      </Link>
                      <div className="text-sm text-gray-500">
                        {lead.contact_person}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </span>
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {lead.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {LEAD_SOURCE_LABELS[lead.source]}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatValue(lead.value)}
                    </div>
                    {lead.probability !== null && (
                      <div className="text-xs text-gray-500">
                        {lead.probability}% sandsynlighed
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {lead.assigned_to_profile?.full_name ||
                      lead.assigned_to_profile?.email ||
                      '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(lead.created_at), 'd. MMM yyyy', {
                      locale: da,
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenMenuId(openMenuId === lead.id ? null : lead.id)
                        }
                        className="p-1 hover:bg-gray-100 rounded-full"
                        aria-label="Flere handlinger"
                      >
                        <MoreHorizontal className="w-5 h-5 text-gray-400" />
                      </button>

                      {openMenuId === lead.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border z-20">
                            <div className="py-1">
                              <Link
                                href={`/dashboard/leads/${lead.id}`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <Eye className="w-4 h-4" />
                                Se detaljer
                              </Link>
                              <button
                                onClick={() => {
                                  setEditingLead(lead)
                                  setOpenMenuId(null)
                                }}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Pencil className="w-4 h-4" />
                                Rediger
                              </button>
                              <button
                                onClick={() => handleDelete(lead.id)}
                                disabled={deletingId === lead.id}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                {deletingId === lead.id
                                  ? 'Sletter...'
                                  : 'Slet'}
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

      {editingLead && (
        <LeadForm
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  )
}
