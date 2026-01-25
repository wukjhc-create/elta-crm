'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { LeadForm } from './lead-form'
import { LeadsTable } from './leads-table'
import type { LeadWithRelations } from '@/types/leads.types'

interface LeadsPageClientProps {
  leads: LeadWithRelations[]
}

export function LeadsPageClient({ leads }: LeadsPageClientProps) {
  const [showForm, setShowForm] = useState(false)

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Leads</h1>
            <p className="text-gray-600 mt-1">
              Administrer og følg dine salgsmuligheder
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 font-medium"
          >
            <Plus className="w-4 h-4" />
            Ny Lead
          </button>
        </div>

        <LeadsTable leads={leads} />
      </div>

      {showForm && <LeadForm onClose={() => setShowForm(false)} />}
    </>
  )
}
