'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Building2,
  ExternalLink,
  Edit,
  Trash2,
  Settings,
  Package,
  Upload,
  History,
  Mail,
  Phone,
  User,
  Key,
  Percent,
  RefreshCw,
} from 'lucide-react'
import { deleteSupplier } from '@/lib/actions/suppliers'
import { SupplierForm } from '@/components/modules/suppliers/supplier-form'
import { SupplierSettingsForm } from '@/components/modules/suppliers/supplier-settings-form'
import { SupplierProductsTable } from '@/components/modules/suppliers/supplier-products-table'
import { ImportHistory } from '@/components/modules/suppliers/import-history'
import { SupplierCredentialsForm } from '@/components/modules/suppliers/supplier-credentials-form'
import { MarginRulesManager } from '@/components/modules/suppliers/margin-rules-manager'
import { SyncJobsManager } from '@/components/modules/suppliers/sync-jobs-manager'
import type { Supplier } from '@/types/suppliers.types'

interface SupplierDetailClientProps {
  supplier: Supplier
}

export function SupplierDetailClient({ supplier }: SupplierDetailClientProps) {
  const router = useRouter()
  const toast = useToast()
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [currentSupplier, setCurrentSupplier] = useState(supplier)

  const handleDelete = async () => {
    if (!confirm(`Er du sikker på at du vil slette "${currentSupplier.name}"? Dette vil også slette alle tilknyttede produkter.`)) {
      return
    }

    const result = await deleteSupplier(currentSupplier.id)
    if (result.success) {
      toast.success('Leverandør slettet')
      router.push('/dashboard/settings/suppliers')
    } else {
      toast.error('Fejl', result.error)
    }
  }

  const handleUpdated = () => {
    setShowEditDialog(false)
    toast.success('Leverandør opdateret')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center">
                <Building2 className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{currentSupplier.name}</h1>
                  {currentSupplier.code && (
                    <Badge variant="outline">{currentSupplier.code}</Badge>
                  )}
                  <Badge variant={currentSupplier.is_active ? 'default' : 'secondary'}>
                    {currentSupplier.is_active ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
                </div>
                {currentSupplier.notes && (
                  <p className="text-gray-500 mt-1">{currentSupplier.notes}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowEditDialog(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Rediger
              </Button>
              <Button variant="outline" className="text-red-600" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Slet
              </Button>
            </div>
          </div>

          {/* Contact info */}
          <div className="flex flex-wrap gap-6 mt-6 pt-6 border-t">
            {currentSupplier.website && (
              <a
                href={currentSupplier.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                {currentSupplier.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {currentSupplier.contact_name && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                {currentSupplier.contact_name}
              </div>
            )}
            {currentSupplier.contact_email && (
              <a
                href={`mailto:${currentSupplier.contact_email}`}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600"
              >
                <Mail className="w-4 h-4" />
                {currentSupplier.contact_email}
              </a>
            )}
            {currentSupplier.contact_phone && (
              <a
                href={`tel:${currentSupplier.contact_phone}`}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600"
              >
                <Phone className="w-4 h-4" />
                {currentSupplier.contact_phone}
              </a>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="px-6 py-3 bg-gray-50 border-t flex gap-2">
          <Link href={`/dashboard/settings/suppliers/${currentSupplier.id}/products`}>
            <Button variant="outline" size="sm">
              <Package className="w-4 h-4 mr-2" />
              Se produkter
            </Button>
          </Link>
          <Link href={`/dashboard/settings/suppliers/${currentSupplier.id}/import`}>
            <Button size="sm">
              <Upload className="w-4 h-4 mr-2" />
              Importer produkter
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            Indstillinger
          </TabsTrigger>
          <TabsTrigger value="credentials">
            <Key className="w-4 h-4 mr-2" />
            API Login
          </TabsTrigger>
          <TabsTrigger value="margins">
            <Percent className="w-4 h-4 mr-2" />
            Marginer
          </TabsTrigger>
          <TabsTrigger value="products">
            <Package className="w-4 h-4 mr-2" />
            Produkter
          </TabsTrigger>
          <TabsTrigger value="sync">
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync Jobs
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            Importhistorik
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6">
          <div className="bg-white rounded-lg border p-6">
            <SupplierSettingsForm
              supplierId={currentSupplier.id}
              supplierCode={currentSupplier.code}
            />
          </div>
        </TabsContent>

        <TabsContent value="credentials" className="mt-6">
          <div className="bg-white rounded-lg border p-6">
            <SupplierCredentialsForm
              supplierId={currentSupplier.id}
              supplierCode={currentSupplier.code}
            />
          </div>
        </TabsContent>

        <TabsContent value="margins" className="mt-6">
          <MarginRulesManager
            supplierId={currentSupplier.id}
            supplierName={currentSupplier.name}
          />
        </TabsContent>

        <TabsContent value="products" className="mt-6">
          <SupplierProductsTable
            supplierId={currentSupplier.id}
            supplierName={currentSupplier.name}
          />
        </TabsContent>

        <TabsContent value="sync" className="mt-6">
          <SyncJobsManager
            supplierId={currentSupplier.id}
            supplierName={currentSupplier.name}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <ImportHistory supplierId={currentSupplier.id} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <SupplierForm
        supplier={currentSupplier}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onSuccess={handleUpdated}
      />
    </div>
  )
}
