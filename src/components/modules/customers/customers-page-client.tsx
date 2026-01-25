'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CustomerForm } from './customer-form'
import { CustomersTable } from './customers-table'
import type { CustomerWithRelations } from '@/types/customers.types'

interface CustomersPageClientProps {
  customers: CustomerWithRelations[]
}

export function CustomersPageClient({ customers }: CustomersPageClientProps) {
  const [showForm, setShowForm] = useState(false)

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Kunder</h1>
            <p className="text-gray-600 mt-1">
              Administrer din kundebase
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 font-medium"
          >
            <Plus className="w-4 h-4" />
            Ny Kunde
          </button>
        </div>

        <CustomersTable customers={customers} />
      </div>

      {showForm && <CustomerForm onClose={() => setShowForm(false)} />}
    </>
  )
}
