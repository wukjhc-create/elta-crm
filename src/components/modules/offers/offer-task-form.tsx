'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { createCustomerTask, getActiveProfiles } from '@/lib/actions/customer-tasks'
import { TASK_PRIORITY_CONFIG } from '@/types/customer-tasks.types'
import type { TaskPriority, CreateCustomerTaskInput } from '@/types/customer-tasks.types'
import { useToast } from '@/components/ui/toast'

interface OfferTaskFormProps {
  offerId: string
  offerTitle: string
  customerId: string | null
  onClose: () => void
  onSuccess: () => void
}

export function OfferTaskForm({ offerId, offerTitle, customerId, onClose, onSuccess }: OfferTaskFormProps) {
  const toast = useToast()
  const [profiles, setProfiles] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [isSaving, setIsSaving] = useState(false)
  const [title, setTitle] = useState(`Følg op: ${offerTitle}`)
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [reminderAt, setReminderAt] = useState('')

  useEffect(() => {
    getActiveProfiles().then(setProfiles)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    if (!customerId) {
      toast.error('Tilbuddet har ingen tilknyttet kunde')
      return
    }

    setIsSaving(true)

    const input: CreateCustomerTaskInput = {
      customer_id: customerId,
      offer_id: offerId,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      assigned_to: assignedTo || undefined,
      due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      reminder_at: reminderAt ? new Date(reminderAt).toISOString() : undefined,
    }

    const result = await createCustomerTask(input)
    if (result.success) {
      toast.success('Opgave oprettet til tilbud')
      onSuccess()
    } else {
      toast.error('Kunne ikke oprette opgave', result.error)
    }

    setIsSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Opret opgave til tilbud</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!customerId ? (
          <div className="text-center py-6">
            <p className="text-gray-500">Tilbuddet skal have en tilknyttet kunde for at oprette en opgave.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 text-sm border rounded-md hover:bg-gray-50">
              Luk
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Hvad skal gøres?"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivelse</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                rows={2}
                placeholder="Yderligere detaljer..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioritet</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  {Object.entries(TASK_PRIORITY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ansvarlig</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="">Mig selv</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forfaldsdato</label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Påmindelse</label>
                <input
                  type="datetime-local"
                  value={reminderAt}
                  onChange={(e) => setReminderAt(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
              >
                Annuller
              </button>
              <button
                type="submit"
                disabled={isSaving || !title.trim()}
                className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {isSaving ? 'Opretter...' : 'Opret opgave'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
