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
  Loader2,
} from 'lucide-react'
import { CustomerForm } from './customer-form'
import { SortableHeader } from '@/components/shared/sortable-header'
import { EmptyState } from '@/components/shared/empty-state'
import { CopyButton } from '@/components/shared/copy-button'
import { useConfirm } from '@/components/shared/confirm-dialog'
import { deleteCustomer, toggleCustomerActive } from '@/lib/actions/customers'
import { useToast } from '@/components/ui/toast'
import type { CustomerWithRelations } from '@/types/customers.types'

interface CustomersTableProps {
  customers: CustomerWithRelations[]
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (column: string) => void
  filtered?: boolean
  onClearFilters?: () => void
}

export function CustomersTable({ customers, sortBy, sortOrder, onSort, filtered, onClearFilters }: CustomersTableProps) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithRelations | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkActing, setIsBulkActing] = useState(false)

  const allSelected = customers.length > 0 && selectedIds.size === customers.length
  const someSelected = selectedIds.size > 0

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(customers.map((c) => c.id)))
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
    const ok = await confirm({
      title: 'Slet kunder',
      description: `Er du sikker på, at du vil slette ${selectedIds.size} kunder? Dette kan ikke fortrydes.`,
      confirmLabel: 'Slet alle',
    })
    if (!ok) return
    setIsBulkActing(true)
    await Promise.allSettled(Array.from(selectedIds).map((id) => deleteCustomer(id)))
    toast.success(`${selectedIds.size} kunder slettet`)
    setSelectedIds(new Set())
    setIsBulkActing(false)
    router.refresh()
  }

  const handleBulkToggleActive = async (active: boolean) => {
    setIsBulkActing(true)
    await Promise.allSettled(Array.from(selectedIds).map((id) => toggleCustomerActive(id, active)))
    toast.success(`${selectedIds.size} kunder ${active ? 'aktiveret' : 'deaktiveret'}`)
    setSelectedIds(new Set())
    setIsBulkActing(false)
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Slet kunde',
      description: 'Er du sikker på, at du vil slette denne kunde? Dette kan ikke fortrydes.',
      confirmLabel: 'Slet',
    })
    if (!ok) return

    setDeletingId(id)
    const result = await deleteCustomer(id)

    if (result.success) {
      toast.success('Kunde slettet')
    } else {
      toast.error('Kunne ikke slette kunde', result.error)
    }

    setDeletingId(null)
    setOpenMenuId(null)
    router.refresh()
  }

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const result = await toggleCustomerActive(id, !currentStatus)

    if (result.success) {
      toast.success(currentStatus ? 'Kunde deaktiveret' : 'Kunde aktiveret')
    } else {
      toast.error('Kunne ikke opdatere status', result.error)
    }

    setOpenMenuId(null)
    router.refresh()
  }

  if (customers.length === 0) {
    return (
      <EmptyState
        icon={Building}
        title={filtered ? 'Ingen kunder fundet' : 'Ingen kunder endnu'}
        description={filtered ? 'Prøv at ændre dine søgekriterier.' : 'Kom i gang ved at oprette din første kunde.'}
        filtered={filtered}
        onClearFilters={onClearFilters}
      />
    )
  }

  return (
    <>
      {/* Bulk Action Bar */}
      {someSelected && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 mb-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-primary flex items-center gap-2">
            {isBulkActing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {selectedIds.size} valgt
          </span>
          <div className="h-4 w-px bg-gray-300" />
          <button
            onClick={() => handleBulkToggleActive(true)}
            disabled={isBulkActing}
            className="text-sm text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
          >
            Aktivér
          </button>
          <button
            onClick={() => handleBulkToggleActive(false)}
            disabled={isBulkActing}
            className="text-sm text-amber-600 hover:text-amber-800 font-medium disabled:opacity-50"
          >
            Deaktivér
          </button>
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
                <SortableHeader label="Kunde" column="company_name" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} />
                <SortableHeader label="Kundenr." column="customer_number" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} />
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                  Kontakt
                </th>
                <SortableHeader label="By" column="billing_city" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="hidden md:table-cell" />
                <SortableHeader label="Status" column="is_active" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} />
                <SortableHeader label="Oprettet" column="created_at" currentSort={sortBy} currentOrder={sortOrder} onSort={onSort || (() => {})} className="hidden lg:table-cell" />
                <th className="relative px-6 py-3">
                  <span className="sr-only">Handlinger</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className={`hover:bg-gray-50 transition-colors ${selectedIds.has(customer.id) ? 'bg-primary/5' : ''}`}
                >
                  <td className="pl-4 pr-2 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(customer.id)}
                      onChange={() => toggleOne(customer.id)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                      aria-label={`Vælg ${customer.company_name}`}
                    />
                  </td>
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
                    <span className="text-sm font-mono text-gray-600 inline-flex items-center gap-1">
                      {customer.customer_number}
                      <CopyButton value={customer.customer_number} label="kundenummer" />
                    </span>
                  </td>
                  <td className="px-6 py-4 hidden lg:table-cell">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
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
                        aria-label="Flere handlinger"
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
      {ConfirmDialog}
    </>
  )
}
