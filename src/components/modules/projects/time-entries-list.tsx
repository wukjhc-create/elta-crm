'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Pencil, Trash2, Calendar, User, CheckCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { deleteTimeEntry } from '@/lib/actions/projects'
import { TimeEntryForm } from './time-entry-form'
import { useToast } from '@/components/ui/toast'
import type { TimeEntryWithRelations, ProjectTask } from '@/types/projects.types'

interface TimeEntriesListProps {
  projectId: string
  timeEntries: TimeEntryWithRelations[]
  tasks?: ProjectTask[]
  onRefresh?: () => void
}

export function TimeEntriesList({
  projectId,
  timeEntries,
  tasks = [],
  onRefresh,
}: TimeEntriesListProps) {
  const router = useRouter()
  const toast = useToast()
  const [editingEntry, setEditingEntry] = useState<TimeEntryWithRelations | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Er du sikker på at du vil slette denne tidsregistrering?')) return

    setDeletingId(id)
    try {
      const result = await deleteTimeEntry(id, projectId)
      if (result.success) {
        toast.success('Tidsregistrering slettet')
      } else {
        toast.error('Kunne ikke slette', result.error)
      }
      router.refresh()
      onRefresh?.()
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Der opstod en fejl ved sletning')
    } finally {
      setDeletingId(null)
    }
  }

  const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
  const billableHours = timeEntries.reduce(
    (sum, entry) => sum + (entry.billable ? entry.hours : 0),
    0
  )

  if (timeEntries.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-12 text-center text-muted-foreground">
        <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Ingen tidsregistreringer endnu.</p>
        <p className="text-sm mt-1">Registrer tid for at se oversigten her.</p>
      </div>
    )
  }

  // Group entries by date
  const entriesByDate = timeEntries.reduce((acc, entry) => {
    const date = entry.date
    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(entry)
    return acc
  }, {} as Record<string, TimeEntryWithRelations[]>)

  const sortedDates = Object.keys(entriesByDate).sort((a, b) => b.localeCompare(a))

  return (
    <>
      {/* Summary */}
      <div className="flex gap-4 mb-4 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">
            Total: <strong>{totalHours}t</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-sm">
            Fakturerbar: <strong>{billableHours}t</strong>
          </span>
        </div>
      </div>

      {/* Entries grouped by date */}
      <div className="space-y-4">
        {sortedDates.map((date) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">{formatDate(date)}</h4>
              <span className="text-xs text-muted-foreground">
                ({entriesByDate[date].reduce((sum, e) => sum + e.hours, 0)}t)
              </span>
            </div>
            <div className="space-y-2 pl-6">
              {entriesByDate[date].map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between p-3 bg-white border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.hours}t</span>
                      {entry.billable && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          Fakturerbar
                        </span>
                      )}
                      {entry.task && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          {entry.task.title}
                        </span>
                      )}
                    </div>
                    {entry.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {entry.description}
                      </p>
                    )}
                    {entry.user && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        {entry.user.full_name || entry.user.email}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingEntry(entry)}
                      className="p-1 hover:bg-muted rounded"
                      aria-label="Rediger tidsregistrering"
                    >
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className="p-1 hover:bg-red-50 rounded"
                      aria-label="Slet tidsregistrering"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Form */}
      {editingEntry && (
        <TimeEntryForm
          projectId={projectId}
          tasks={tasks}
          timeEntry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSuccess={() => {
            setEditingEntry(null)
            router.refresh()
            onRefresh?.()
          }}
        />
      )}
    </>
  )
}
