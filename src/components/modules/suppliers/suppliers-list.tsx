'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  Plus,
  Search,
  Building2,
  ExternalLink,
  Settings,
  Package,
  Upload,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { getSuppliers, deleteSupplier } from '@/lib/actions/suppliers'
import type { Supplier } from '@/types/suppliers.types'
import { SupplierForm } from './supplier-form'

export function SuppliersList() {
  const toast = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(() => {
    loadSuppliers()
  }, [])

  const loadSuppliers = async () => {
    setLoading(true)
    const result = await getSuppliers({ is_active: true })
    if (result.success && result.data) {
      setSuppliers(result.data)
    }
    setLoading(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Er du sikker på at du vil slette leverandøren "${name}"?`)) return

    const result = await deleteSupplier(id)
    if (result.success) {
      toast.success('Leverandør slettet')
      loadSuppliers()
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleCreated = () => {
    setShowCreateDialog(false)
    loadSuppliers()
    toast.success('Leverandør oprettet')
  }

  // Filter suppliers
  const filteredSuppliers = suppliers.filter((s) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      s.code?.toLowerCase().includes(q)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Leverandører</h2>
          <p className="text-sm text-gray-500">
            Administrer grossister og leverandører for produktimport
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Ny leverandør
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Søg leverandører..."
          className="pl-10"
        />
      </div>

      {/* Suppliers Grid */}
      {filteredSuppliers.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center">
          <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 mb-4">
            {search ? 'Ingen leverandører matcher din søgning' : 'Ingen leverandører endnu'}
          </p>
          {!search && (
            <Button variant="outline" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Opret din første leverandør
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="bg-white rounded-lg border hover:border-blue-300 transition-colors"
            >
              {/* Card Header */}
              <div className="p-4 border-b">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-medium">{supplier.name}</h3>
                      {supplier.code && (
                        <p className="text-xs text-gray-500">Kode: {supplier.code}</p>
                      )}
                    </div>
                  </div>
                  <Badge variant={supplier.is_active ? 'default' : 'secondary'}>
                    {supplier.is_active ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-2">
                {supplier.website && (
                  <a
                    href={supplier.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {supplier.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {supplier.contact_email && (
                  <p className="text-sm text-gray-500">{supplier.contact_email}</p>
                )}
                {supplier.notes && (
                  <p className="text-sm text-gray-400 line-clamp-2">{supplier.notes}</p>
                )}
              </div>

              {/* Card Actions */}
              <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
                <div className="flex gap-2">
                  <Link href={`/dashboard/settings/suppliers/${supplier.id}/products`}>
                    <Button variant="outline" size="sm">
                      <Package className="w-4 h-4 mr-1" />
                      Produkter
                    </Button>
                  </Link>
                  <Link href={`/dashboard/settings/suppliers/${supplier.id}/import`}>
                    <Button variant="outline" size="sm">
                      <Upload className="w-4 h-4 mr-1" />
                      Import
                    </Button>
                  </Link>
                </div>
                <Link href={`/dashboard/settings/suppliers/${supplier.id}`}>
                  <Button variant="ghost" size="sm">
                    <Settings className="w-4 h-4 mr-1" />
                    Indstillinger
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <SupplierForm
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleCreated}
      />
    </div>
  )
}
