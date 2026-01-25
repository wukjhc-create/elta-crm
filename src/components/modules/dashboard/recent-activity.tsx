import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { da } from 'date-fns/locale'
import {
  Users,
  Building2,
  FileText,
  FolderKanban,
  Clock,
} from 'lucide-react'
import type { RecentActivity as RecentActivityType } from '@/lib/actions/dashboard'

interface RecentActivityProps {
  activities: RecentActivityType[]
}

const TYPE_CONFIG = {
  lead: {
    icon: Users,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  customer: {
    icon: Building2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  offer: {
    icon: FileText,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  project: {
    icon: FolderKanban,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  message: {
    icon: FileText,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
}

export function RecentActivity({ activities }: RecentActivityProps) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Ingen aktivitet endnu</p>
      </div>
    )
  }

  return (
    <div className="divide-y">
      {activities.map((activity) => {
        const config = TYPE_CONFIG[activity.type]
        const Icon = config.icon

        return (
          <div key={activity.id} className="py-3 first:pt-0 last:pb-0">
            <Link
              href={activity.link || '#'}
              className="flex items-start gap-3 hover:bg-muted/50 -mx-2 px-2 py-1 rounded-md transition-colors"
            >
              <div className={`p-2 rounded-lg ${config.bgColor} flex-shrink-0`}>
                <Icon className={`w-4 h-4 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{activity.action}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {activity.title}
                  {activity.description && ` - ${activity.description}`}
                </p>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatDistanceToNow(new Date(activity.created_at), {
                  addSuffix: true,
                  locale: da,
                })}
              </span>
            </Link>
          </div>
        )
      })}
    </div>
  )
}
