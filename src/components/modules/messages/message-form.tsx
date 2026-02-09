'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Send, Paperclip, Link2 } from 'lucide-react'
import { createMessageSchema, type CreateMessageInput } from '@/lib/validations/messages'
import {
  sendMessage,
  getTeamMembersForMessage,
  getRelatedEntities,
} from '@/lib/actions/messages'
import {
  MESSAGE_TYPES,
  MESSAGE_TYPE_LABELS,
  type Message,
} from '@/types/messages.types'

interface MessageFormProps {
  replyTo?: Message
  onClose: () => void
  onSuccess?: (message: Message) => void
}

export function MessageForm({ replyTo, onClose, onSuccess }: MessageFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showLinkOptions, setShowLinkOptions] = useState(false)
  const [teamMembers, setTeamMembers] = useState<
    { id: string; full_name: string | null; email: string }[]
  >([])
  const [relatedEntities, setRelatedEntities] = useState<{
    leads: { id: string; contact_person: string; company_name: string }[]
    customers: { id: string; company_name: string; customer_number: string }[]
    projects: { id: string; project_number: string; name: string }[]
  }>({ leads: [], customers: [], projects: [] })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateMessageInput>({
    resolver: zodResolver(createMessageSchema),
    defaultValues: replyTo
      ? {
          subject: replyTo.subject.startsWith('Re:')
            ? replyTo.subject
            : `Re: ${replyTo.subject}`,
          to_user_id: replyTo.from_user_id || '',
          reply_to: replyTo.id,
          message_type: 'internal',
          lead_id: replyTo.lead_id,
          customer_id: replyTo.customer_id,
          project_id: replyTo.project_id,
        }
      : {
          message_type: 'internal',
        },
  })

  useEffect(() => {
    async function loadData() {
      const [teamResult, entitiesResult] = await Promise.all([
        getTeamMembersForMessage(),
        getRelatedEntities(),
      ])

      if (teamResult.success && teamResult.data) {
        setTeamMembers(teamResult.data)
      }
      if (entitiesResult.success && entitiesResult.data) {
        setRelatedEntities(entitiesResult.data)
      }
    }
    loadData()
  }, [])

  const onSubmit = async (data: CreateMessageInput) => {
    try {
      setIsLoading(true)
      setError(null)

      const formData = new FormData()
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          formData.append(key, String(value))
        }
      })

      const result = await sendMessage(formData)

      if (!result.success) {
        setError(result.error || 'Der opstod en fejl')
        return
      }

      if (result.data) {
        onSuccess?.(result.data)
      }
      onClose()
      router.refresh()
    } catch (err) {
      setError('Der opstod en uventet fejl')
      console.error('Form submit error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-semibold">
            {replyTo ? 'Svar på besked' : 'Ny Besked'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full" aria-label="Luk">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          {/* Hidden fields */}
          {replyTo && <input type="hidden" {...register('reply_to')} />}

          {/* To */}
          <div className="space-y-1">
            <label htmlFor="to_user_id" className="text-sm font-medium">
              Til *
            </label>
            <select
              {...register('to_user_id')}
              id="to_user_id"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            >
              <option value="">Vælg modtager...</option>
              {teamMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name || member.email}
                </option>
              ))}
            </select>
            {errors.to_user_id && (
              <p className="text-sm text-red-600">{errors.to_user_id.message}</p>
            )}
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <label htmlFor="subject" className="text-sm font-medium">
              Emne *
            </label>
            <input
              {...register('subject')}
              id="subject"
              type="text"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />
            {errors.subject && (
              <p className="text-sm text-red-600">{errors.subject.message}</p>
            )}
          </div>

          {/* Message Type */}
          <div className="space-y-1">
            <label htmlFor="message_type" className="text-sm font-medium">
              Type
            </label>
            <select
              {...register('message_type')}
              id="message_type"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            >
              {MESSAGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MESSAGE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          {/* Body */}
          <div className="space-y-1">
            <label htmlFor="body" className="text-sm font-medium">
              Besked *
            </label>
            <textarea
              {...register('body')}
              id="body"
              rows={8}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isLoading}
            />
            {errors.body && (
              <p className="text-sm text-red-600">{errors.body.message}</p>
            )}
          </div>

          {/* Link Options */}
          <div>
            <button
              type="button"
              onClick={() => setShowLinkOptions(!showLinkOptions)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Link2 className="w-4 h-4" />
              Tilknyt til lead, kunde eller projekt
            </button>

            {showLinkOptions && (
              <div className="mt-3 p-3 bg-muted/50 rounded-md space-y-3">
                {/* Lead */}
                <div className="space-y-1">
                  <label htmlFor="lead_id" className="text-sm font-medium">
                    Lead
                  </label>
                  <select
                    {...register('lead_id')}
                    id="lead_id"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    disabled={isLoading}
                  >
                    <option value="">Ingen lead...</option>
                    {relatedEntities.leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.contact_person} {lead.company_name && `(${lead.company_name})`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Customer */}
                <div className="space-y-1">
                  <label htmlFor="customer_id" className="text-sm font-medium">
                    Kunde
                  </label>
                  <select
                    {...register('customer_id')}
                    id="customer_id"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    disabled={isLoading}
                  >
                    <option value="">Ingen kunde...</option>
                    {relatedEntities.customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.company_name} ({customer.customer_number})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Project */}
                <div className="space-y-1">
                  <label htmlFor="project_id" className="text-sm font-medium">
                    Projekt
                  </label>
                  <select
                    {...register('project_id')}
                    id="project_id"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    disabled={isLoading}
                  >
                    <option value="">Intet projekt...</option>
                    {relatedEntities.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.project_number} - {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="flex gap-2">
              <button
                type="button"
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
                title="Vedhæft fil (kommer snart)"
                disabled
              >
                <Paperclip className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
                disabled={isLoading}
              >
                Annuller
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {isLoading ? 'Sender...' : 'Send besked'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
