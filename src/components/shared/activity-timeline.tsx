'use client'

import { format } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  Plus,
  ArrowRight,
  User,
  DollarSign,
  Edit,
  MessageSquare,
  Phone,
  Mail,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'
import type { LeadActivity } from '@/types/leads.types'

interface ActivityTimelineProps {
  activities: LeadActivity[]
  className?: string
}

const activityIcons: Record<string, React.ReactNode> = {
  created: <Plus className="w-4 h-4" />,
  status_change: <ArrowRight className="w-4 h-4" />,
  assigned: <User className="w-4 h-4" />,
  unassigned: <User className="w-4 h-4" />,
  value_change: <DollarSign className="w-4 h-4" />,
  updated: <Edit className="w-4 h-4" />,
  note: <MessageSquare className="w-4 h-4" />,
  call: <Phone className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  meeting: <FileText className="w-4 h-4" />,
  won: <CheckCircle className="w-4 h-4" />,
  lost: <XCircle className="w-4 h-4" />,
}

const activityColors: Record<string, string> = {
  created: 'bg-green-100 text-green-600',
  status_change: 'bg-blue-100 text-blue-600',
  assigned: 'bg-purple-100 text-purple-600',
  unassigned: 'bg-gray-100 text-gray-600',
  value_change: 'bg-yellow-100 text-yellow-600',
  updated: 'bg-gray-100 text-gray-600',
  note: 'bg-indigo-100 text-indigo-600',
  call: 'bg-cyan-100 text-cyan-600',
  email: 'bg-pink-100 text-pink-600',
  meeting: 'bg-orange-100 text-orange-600',
  won: 'bg-green-100 text-green-600',
  lost: 'bg-red-100 text-red-600',
}

export function ActivityTimeline({ activities, className = '' }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <Clock className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p>Ingen aktiviteter endnu</p>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

      <ul className="space-y-4">
        {activities.map((activity) => {
          const icon = activityIcons[activity.activity_type] || <Edit className="w-4 h-4" />
          const colorClass = activityColors[activity.activity_type] || 'bg-gray-100 text-gray-600'

          return (
            <li key={activity.id} className="relative pl-10">
              {/* Icon circle */}
              <div
                className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center ${colorClass}`}
              >
                {icon}
              </div>

              {/* Content */}
              <div className="bg-white border rounded-lg p-3">
                <p className="text-sm text-gray-900">{activity.description}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <time>
                    {format(new Date(activity.created_at), 'd. MMM yyyy HH:mm', {
                      locale: da,
                    })}
                  </time>
                  {activity.performed_by_profile && (
                    <>
                      <span>&middot;</span>
                      <span>
                        {activity.performed_by_profile.full_name ||
                          activity.performed_by_profile.email}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Compact version for dashboards/cards
export function ActivityList({
  activities,
  limit = 5,
  className = '',
}: {
  activities: LeadActivity[]
  limit?: number
  className?: string
}) {
  const displayActivities = activities.slice(0, limit)

  if (displayActivities.length === 0) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        Ingen aktiviteter
      </div>
    )
  }

  return (
    <ul className={`space-y-2 ${className}`}>
      {displayActivities.map((activity) => (
        <li key={activity.id} className="flex items-start gap-2 text-sm">
          <span className="text-gray-400 flex-shrink-0">
            {format(new Date(activity.created_at), 'd/M', { locale: da })}
          </span>
          <span className="text-gray-700 truncate">{activity.description}</span>
        </li>
      ))}
      {activities.length > limit && (
        <li className="text-sm text-primary">
          +{activities.length - limit} flere aktiviteter
        </li>
      )}
    </ul>
  )
}
