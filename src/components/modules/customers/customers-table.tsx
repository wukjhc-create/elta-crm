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
  Building,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { CustomerForm } from './customer-form'
import { deleteCustomer, toggleCustomerActive } from '@/lib/actions/customers'
import type { CustomerWithRelations } from '@/types/customers.types'

interface CustomersTableProps {
  customers: CustomerWithRelations[]
}

export function CustomersTable({ customers }: CustomersTableProps) {
  const router = useRouter()
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithRelations | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Er du sikker på, at du vil slette denne kunde?')) {
      return
    }

    setDeletingId(id)
    const result = await deleteCustomer(id)

    if (!result.success) {
      alert(result.error || 'Kunne ikke slette kunde')
    }

    setDeletingId(null)
    setOpenMenuId(null)
    router.refresh()
  }

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const result = await toggleCustomerActive(id, !currentStatus)

    if (!result.success) {
      alert(result.error || 'Kunne ikke opdatere status')
    }

    setOpenMenuId(null)
    router.refresh()
  }

  if (customers.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Building className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">Ingen kunder endnu</h3>
        <p className="text-gray-500">
          Kom i gang ved at oprette din første kunde.
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
                  Kunde
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kundenr.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kontakt
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
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
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div>
                      <Link
                        href={`/dashboard/customers/${customer.id}`}
                        className="font-medium text-gray-900 hover:text-primary"
                      >
                        {customer.company_name}
                      </Link>
                      {customer.vat_number && (
                        <div className="text-sm text-gray-500">
                          CVR: {customer.vat_number}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-mono text-gray-600">
                      {customer.customer_number}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {customer.contact_person}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {customer.email}
                      </span>
                      {customer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {customer.phone}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {customer.billing_city || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {customer.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3" />
                        Aktiv
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <XCircle className="w-3 h-3" />
                        Inaktiv
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(customer.created_at), 'd. MMM yyyy', {
                      locale: da,
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenMenuId(openMenuId === customer.id ? null : customer.id)
                        }
                        className="p-1 hover:bg-gray-100 rounded-full"
                      >
                        <MoreHorizontal className="w-5 h-5 text-gray-400" />
                      </button>

                      {openMenuId === customer.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border z-20">
                            <div className="py-1">
                              <Link
                                href={`/dashboard/customers/${customer.id}`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <Eye className="w-4 h-4" />
                                Se detaljer
                              </Link>
                              <button
                                onClick={() => {
                                  setEditingCustomer(customer)
                                  setOpenMenuId(null)
                                }}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Pencil className="w-4 h-4" />
                                Rediger
                              </button>
                              <button
                                onClick={() =>
                                  handleToggleActive(customer.id, customer.is_active)
                                }
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                {customer.is_active ? (
                                  <>
                                    <XCircle className="w-4 h-4" />
                                    Deaktiver
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4" />
                                    Aktiver
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleDelete(customer.id)}
                                disabled={deletingId === customer.id}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                                {deletingId === customer.id ? 'Sletter...' : 'Slet'}
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

      {editingCustomer && (
        <CustomerForm
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  )
}
