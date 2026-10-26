'use client'

import { useState } from 'react'
import { Plus, Users, Building2, FileText, FolderKanban, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { LeadForm } from '@/components/modules/leads/lead-form'
import { CustomerCreateDialog } from '@/components/modules/customers/customer-create-dialog'
import { OfferForm } from '@/components/modules/offers/offer-form'
import { useUserRole } from '@/lib/hooks/use-user-role'
import type { Permission } from '@/lib/auth/permissions'
import { MessageForm } from '@/components/modules/messages/message-form'
import type { CompanySettings } from '@/types/company-settings.types'

type ActionType = 'lead' | 'customer' | 'offer' | 'project' | 'message' | null

interface QuickActionsProps {
  companySettings?: CompanySettings | null
}

const ACTIONS = [
  {
    type: 'lead' as const,
    permission: 'leads.create' as Permission,
    label: 'Ny Lead',
    icon: Users,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    type: 'customer' as const,
    permission: 'customers.create' as Permission,
    label: 'Ny Kunde',
    icon: Building2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    type: 'offer' as const,
    permission: 'offers.create' as Permission,
    label: 'Nyt Tilbud',
    icon: FileText,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    // M-13: "Nyt Projekt" oprettede et usynligt legacy-projekt (/dashboard/projects viderestiller til sager) — nu "Ny sag"
    type: 'project' as const,
    permission: 'cases.create' as Permission,
    label: 'Ny sag',
    icon: FolderKanban,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  {
    type: 'message' as const,
    permission: null,
    label: 'Ny Besked',
    icon: Mail,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
]

export function QuickActions({ companySettings }: QuickActionsProps) {
  const router = useRouter()
  const [activeForm, setActiveForm] = useState<ActionType>(null)
  // M-13 (mobil-review 2026-10-14): kun genveje brugeren har ret til (bogholderi udfyldte formularer der blev afvist)
  const { can } = useUserRole()
  const actions = ACTIONS.filter((a) => !a.permission || can(a.permission))

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.type}
              onClick={() => (action.type === 'project' ? router.push('/dashboard/orders/new') : setActiveForm(action.type))}
              className="flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className={`p-2 rounded-lg ${action.bgColor}`}>
                <Icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <span className="font-medium text-sm">{action.label}</span>
            </button>
          )
        })}
      </div>

      {/* Forms */}
      {activeForm === 'lead' && (
        <LeadForm onClose={() => setActiveForm(null)} />
      )}
      {activeForm === 'customer' && (
        <CustomerCreateDialog
          mode="full"
          onClose={() => setActiveForm(null)}
          onCreated={() => {
            setActiveForm(null)
            router.refresh()
          }}
        />
      )}
      {activeForm === 'offer' && (
        <OfferForm companySettings={companySettings} onClose={() => setActiveForm(null)} />
      )}
      {activeForm === 'message' && (
        <MessageForm onClose={() => setActiveForm(null)} />
      )}
    </>
  )
}
