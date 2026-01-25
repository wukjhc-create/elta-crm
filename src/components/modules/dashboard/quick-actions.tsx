'use client'

import { useState } from 'react'
import { Plus, Users, Building2, FileText, FolderKanban, Mail } from 'lucide-react'
import { LeadForm } from '@/components/modules/leads/lead-form'
import { CustomerForm } from '@/components/modules/customers/customer-form'
import { OfferForm } from '@/components/modules/offers/offer-form'
import { ProjectForm } from '@/components/modules/projects/project-form'
import { MessageForm } from '@/components/modules/messages/message-form'

type ActionType = 'lead' | 'customer' | 'offer' | 'project' | 'message' | null

const ACTIONS = [
  {
    type: 'lead' as const,
    label: 'Ny Lead',
    icon: Users,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    type: 'customer' as const,
    label: 'Ny Kunde',
    icon: Building2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    type: 'offer' as const,
    label: 'Nyt Tilbud',
    icon: FileText,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    type: 'project' as const,
    label: 'Nyt Projekt',
    icon: FolderKanban,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  {
    type: 'message' as const,
    label: 'Ny Besked',
    icon: Mail,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
]

export function QuickActions() {
  const [activeForm, setActiveForm] = useState<ActionType>(null)

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.type}
              onClick={() => setActiveForm(action.type)}
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
        <CustomerForm onClose={() => setActiveForm(null)} />
      )}
      {activeForm === 'offer' && (
        <OfferForm onClose={() => setActiveForm(null)} />
      )}
      {activeForm === 'project' && (
        <ProjectForm onClose={() => setActiveForm(null)} />
      )}
      {activeForm === 'message' && (
        <MessageForm onClose={() => setActiveForm(null)} />
      )}
    </>
  )
}
