'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GripVertical, User } from 'lucide-react'
import { updateLeadStatus } from '@/lib/actions/leads'
import type { LeadWithRelations, LeadStatus } from '@/types/leads.types'
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  LEAD_STATUS_TRANSITIONS,
} from '@/types/leads.types'
import { formatCurrency } from '@/lib/utils/format'

interface LeadsKanbanProps {
  leads: LeadWithRelations[]
}

const PIPELINE_STATUSES: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']

export function LeadsKanban({ leads }: LeadsKanbanProps) {
  const router = useRouter()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<LeadStatus | null>(null)
  const [isUpdating, setIsUpdating] = useState<string | null>(null)

  // Group leads by status
  const columns: Record<LeadStatus, LeadWithRelations[]> = {} as Record<LeadStatus, LeadWithRelations[]>
  for (const s of PIPELINE_STATUSES) {
    columns[s] = []
  }
  for (const lead of leads) {
    if (columns[lead.status]) {
      columns[lead.status].push(lead)
    }
  }

  const getDraggedLead = () => leads.find((l) => l.id === draggingId)

  const canDrop = (targetStatus: LeadStatus): boolean => {
    const lead = getDraggedLead()
    if (!lead) return false
    if (lead.status === targetStatus) return false
    return LEAD_STATUS_TRANSITIONS[lead.status]?.includes(targetStatus) ?? false
  }

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', leadId)
    setDraggingId(leadId)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverCol(null)
  }

  const handleDragOver = (e: React.DragEvent, status: LeadStatus) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = canDrop(status) ? 'move' : 'none'
    setDragOverCol(status)
  }

  const handleDragLeave = () => {
    setDragOverCol(null)
  }

  const handleDrop = async (e: React.DragEvent, targetStatus: LeadStatus) => {
    e.preventDefault()
    setDragOverCol(null)
    const leadId = e.dataTransfer.getData('text/plain')
    if (!leadId || !canDrop(targetStatus)) return

    setIsUpdating(leadId)
    const result = await updateLeadStatus(leadId, targetStatus)
    setIsUpdating(null)

    if (result.success) {
      router.refresh()
    }
  }

  // Calculate total value per column
  const colValue = (items: LeadWithRelations[]) =>
    items.reduce((sum, l) => sum + (l.value || 0), 0)

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-[1200px]">
        {PIPELINE_STATUSES.map((status) => {
          const items = columns[status]
          const isOver = dragOverCol === status
          const droppable = draggingId ? canDrop(status) : false
          const total = colValue(items)

          return (
            <div
              key={status}
              className={`flex-1 min-w-[170px] rounded-lg border-2 transition-colors ${
                isOver && droppable
                  ? 'border-primary bg-primary/5'
                  : isOver && !droppable
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-gray-50'
              }`}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              {/* Column Header */}
              <div className="p-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${LEAD_STATUS_COLORS[status]}`}>
                    {LEAD_STATUS_LABELS[status]}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">{items.length}</span>
                </div>
                {total > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">{formatCurrency(total)}</p>
                )}
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-[200px]">
                {items.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => router.push(`/dashboard/leads/${lead.id}`)}
                    className={`bg-white rounded-md border shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                      draggingId === lead.id ? 'opacity-40' : ''
                    } ${isUpdating === lead.id ? 'animate-pulse' : ''}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {lead.company_name}
                        </p>
                        {lead.contact_person && (
                          <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {lead.contact_person}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center justify-between mt-2">
                      {lead.value ? (
                        <span className="text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                          {formatCurrency(lead.value)}
                        </span>
                      ) : (
                        <span />
                      )}
                      {lead.assigned_to_profile?.full_name && (
                        <span className="text-[10px] text-gray-400 truncate max-w-[80px]">
                          {lead.assigned_to_profile.full_name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
