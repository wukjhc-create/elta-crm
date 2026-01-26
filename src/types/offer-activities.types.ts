// Offer activity types
export const OFFER_ACTIVITY_TYPES = [
  'created',
  'updated',
  'status_change',
  'sent',
  'viewed',
  'accepted',
  'rejected',
  'project_created',
  'pdf_generated',
  'email_sent',
] as const

export type OfferActivityType = (typeof OFFER_ACTIVITY_TYPES)[number]

// Activity type labels in Danish
export const OFFER_ACTIVITY_LABELS: Record<OfferActivityType, string> = {
  created: 'Oprettet',
  updated: 'Opdateret',
  status_change: 'Status ændret',
  sent: 'Sendt',
  viewed: 'Set',
  accepted: 'Accepteret',
  rejected: 'Afvist',
  project_created: 'Projekt oprettet',
  pdf_generated: 'PDF genereret',
  email_sent: 'Email sendt',
}

// Activity type icons (lucide icon names)
export const OFFER_ACTIVITY_ICONS: Record<OfferActivityType, string> = {
  created: 'Plus',
  updated: 'Pencil',
  status_change: 'ArrowRight',
  sent: 'Send',
  viewed: 'Eye',
  accepted: 'CheckCircle',
  rejected: 'XCircle',
  project_created: 'FolderPlus',
  pdf_generated: 'FileText',
  email_sent: 'Mail',
}

// Activity type colors
export const OFFER_ACTIVITY_COLORS: Record<OfferActivityType, string> = {
  created: 'bg-blue-100 text-blue-600',
  updated: 'bg-gray-100 text-gray-600',
  status_change: 'bg-purple-100 text-purple-600',
  sent: 'bg-indigo-100 text-indigo-600',
  viewed: 'bg-yellow-100 text-yellow-600',
  accepted: 'bg-green-100 text-green-600',
  rejected: 'bg-red-100 text-red-600',
  project_created: 'bg-emerald-100 text-emerald-600',
  pdf_generated: 'bg-orange-100 text-orange-600',
  email_sent: 'bg-cyan-100 text-cyan-600',
}

// Offer activity database type
export interface OfferActivity {
  id: string
  offer_id: string
  activity_type: OfferActivityType
  description: string
  performed_by: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// Offer activity with performer details
export interface OfferActivityWithPerformer extends OfferActivity {
  performer?: {
    id: string
    full_name: string | null
    email: string
  } | null
}
