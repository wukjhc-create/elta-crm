'use client'

import { useMemo } from 'react'
import { Clock, CheckCircle2, PlayCircle, FileText, AlertCircle } from 'lucide-react'
import { formatDateTimeDK, formatTimeAgo } from '@/lib/utils/format'
import type { ProjectTaskWithRelations, TimeEntryWithRelations } from '@/types/projects.types'

// =====================================================
// Types
// =====================================================

interface ActivityItem {
  id: string
  type: 'time_entry' | 'task_completed' | 'task_created'
  date: string
  title: string
  description: string | null
  meta: string | null
}

interface ProjectActivityTimelineProps {
  tasks: ProjectTaskWithRelations[]
  timeEntries: TimeEntryWithRelations[]
}

// =====================================================
// Component
// =====================================================

export function ProjectActivityTimeline({ tasks, timeEntries }: ProjectActivityTimelineProps) {
  const activities = useMemo(() => {
    const items: ActivityItem[] = []

    // Time entries
    for (const entry of timeEntries) {
      const userName = entry.user?.full_name || entry.user?.email || 'Ukendt'

      items.push({
        id: `time-${entry.id}`,
        type: 'time_entry',
        date: entry.date || entry.created_at,
        title: `${userName} registrerede ${entry.hours}t`,
        description: entry.description || null,
        meta: entry.billable ? 'Fakturerbar' : 'Intern',
      })
    }

    // Completed tasks
    for (const task of tasks) {
      if (task.status === 'done' && task.completed_at) {
        items.push({
          id: `task-done-${task.id}`,
          type: 'task_completed',
          date: task.completed_at,
          title: `Opgave afsluttet: ${task.title}`,
          description: null,
          meta: task.actual_hours ? `${task.actual_hours}t brugt` : null,
        })
      }

      // Task creation
      items.push({
        id: `task-new-${task.id}`,
        type: 'task_created',
        date: task.created_at,
        title: `Opgave oprettet: ${task.title}`,
        description: null,
        meta: task.estimated_hours ? `Est. ${task.estimated_hours}t` : null,
      })
    }

    // Sort by date, newest first
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return items
  }, [tasks, timeEntries])

  const getIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'time_entry':
        return <Clock className="w-4 h-4 text-blue-500" />
      case 'task_completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'task_created':
        return <PlayCircle className="w-4 h-4 text-gray-400" />
    }
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Ingen aktivitet endnu</p>
      </div>
    )
  }

  // Group by date
  const grouped = new Map<string, ActivityItem[]>()
  for (const item of activities) {
    const dateKey = new Date(item.date).toLocaleDateString('da-DK', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const group = grouped.get(dateKey) || []
    group.push(item)
    grouped.set(dateKey, group)
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([dateLabel, items]) => (
        <div key={dateLabel}>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {dateLabel}
          </h4>
          <div className="space-y-0">
            {items.map((item, idx) => (
              <div key={item.id} className="flex gap-3 relative">
                {/* Timeline line */}
                {idx < items.length - 1 && (
                  <div className="absolute left-[11px] top-7 w-px h-full bg-gray-200" />
                )}
                {/* Icon */}
                <div className="flex-shrink-0 mt-1 z-10 bg-white">
                  {getIcon(item.type)}
                </div>
                {/* Content */}
                <div className="flex-1 pb-4">
                  <p className="text-sm text-gray-900">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{formatTimeAgo(item.date)}</span>
                    {item.meta && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                        {item.meta}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
