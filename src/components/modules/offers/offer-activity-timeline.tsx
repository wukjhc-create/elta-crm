'use client'

import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  Plus,
  Pencil,
  ArrowRight,
  Send,
  Eye,
  CheckCircle,
  XCircle,
  FolderPlus,
  FileText,
  Mail,
  Activity,
} from 'lucide-react'
import type {
  OfferActivityWithPerformer,
  OfferActivityType,
} from '@/types/offer-activities.types'
import {
  OFFER_ACTIVITY_LABELS,
  OFFER_ACTIVITY_COLORS,
} from '@/types/offer-activities.types'

interface OfferActivityTimelineProps {
  activities: OfferActivityWithPerformer[]
}

// Icon mapping
const ACTIVITY_ICONS: Record<OfferActivityType, typeof Plus> = {
  created: Plus,
  updated: Pencil,
  status_change: ArrowRight,
  sent: Send,
  viewed: Eye,
  accepted: CheckCircle,
  rejected: XCircle,
  project_created: FolderPlus,
  pdf_generated: FileText,
  email_sent: Mail,
}

export function OfferActivityTimeline({ activities }: OfferActivityTimelineProps) {
  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Activity className="w-12 h-12 mx-auto mb-2 text-gray-300" />
        <p>Ingen aktiviteter endnu</p>
      </div>
    )
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {activities.map((activity, activityIdx) => {
          const Icon = ACTIVITY_ICONS[activity.activity_type] || Activity
          const colorClass = OFFER_ACTIVITY_COLORS[activity.activity_type] || 'bg-gray-100 text-gray-600'

          return (
            <li key={activity.id}>
              <div className="relative pb-8">
                {/* Connector line */}
                {activityIdx !== activities.length - 1 ? (
                  <span
                    className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200"
                    aria-hidden="true"
                  />
                ) : null}

                <div className="relative flex items-start space-x-3">
                  {/* Icon */}
                  <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${colorClass}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {OFFER_ACTIVITY_LABELS[activity.activity_type]}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(
                          new Date(activity.created_at),
                          'd. MMM HH:mm',
                          { locale: da }
                        )}
                      </p>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">
                      {activity.description}
                    </p>
                    {activity.performer && (
                      <p className="mt-1 text-xs text-gray-400">
                        af {activity.performer.full_name || activity.performer.email}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
