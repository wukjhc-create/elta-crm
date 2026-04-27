'use client'

import { useState, useEffect } from 'react'
import {
  UserPlus,
  Search,
  FileText,
  FileCheck,
  FileSignature,
  Wrench,
  CheckCircle,
  Clock,
  AlertTriangle,
  Circle,
  Loader2,
  ChevronRight,
  Mail,
} from 'lucide-react'
import { getCustomerFlow } from '@/lib/actions/customer-flow'
import type { FlowStep, StepStatus } from '@/lib/actions/customer-flow'

interface CustomerStatusFlowProps {
  customerId: string
  customerEmail: string
  onNavigateTab?: (tab: 'oversigt' | 'besigtigelse' | 'dokumenter') => void
}

const STEP_ICONS: Record<string, typeof UserPlus> = {
  lead: UserPlus,
  besigtigelse: Search,
  rapport: FileText,
  tilbud: FileCheck,
  fuldmagt: FileSignature,
  montage: Wrench,
}

const STATUS_CONFIG: Record<StepStatus, { bg: string; border: string; text: string; icon: typeof CheckCircle; iconColor: string; label: string }> = {
  not_started: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-400',
    icon: Circle,
    iconColor: 'text-gray-300',
    label: 'Ikke startet',
  },
  awaiting: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: Clock,
    iconColor: 'text-amber-500',
    label: 'Afventer',
  },
  done: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    icon: CheckCircle,
    iconColor: 'text-green-500',
    label: 'Færdig',
  },
  reminder_sent: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    label: 'Rykker sendt',
  },
}

export function CustomerStatusFlow({ customerId, customerEmail, onNavigateTab }: CustomerStatusFlowProps) {
  const [steps, setSteps] = useState<FlowStep[]>([])
  const [lastEmailDate, setLastEmailDate] = useState<string | null>(null)
  const [unreadEmailCount, setUnreadEmailCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const data = await getCustomerFlow(customerId, customerEmail)
      setSteps(data.steps)
      setLastEmailDate(data.lastEmailDate || null)
      setUnreadEmailCount(data.unreadEmailCount || 0)
      setIsLoading(false)
    }
    load()
  }, [customerId, customerEmail])

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  const doneCount = steps.filter((s) => s.status === 'done').length
  const progressPercent = Math.round((doneCount / steps.length) * 100)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Progress summary */}
      <div className="bg-white rounded-lg border p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-gray-700">Samlet fremgang</h3>
          <span className="text-sm font-medium text-gray-500">{doneCount} af {steps.length} trin</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {(['not_started', 'awaiting', 'done', 'reminder_sent'] as StepStatus[]).map((s) => {
            const cfg = STATUS_CONFIG[s]
            const Icon = cfg.icon
            return (
              <span key={s} className="inline-flex items-center gap-1 text-xs text-gray-500">
                <Icon className={`w-3 h-3 ${cfg.iconColor}`} />
                {cfg.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Email activity card */}
      <div className="bg-white rounded-lg border p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
            unreadEmailCount > 0 ? 'bg-blue-100' : 'bg-gray-100'
          }`}>
            <Mail className={`w-5 h-5 ${unreadEmailCount > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-gray-700">Email-aktivitet</h3>
              {unreadEmailCount > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                  {unreadEmailCount} ulæst{unreadEmailCount !== 1 ? 'e' : ''}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {lastEmailDate
                ? `Sidste kontakt: ${new Date(lastEmailDate).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })}`
                : 'Ingen email-korrespondance endnu'}
            </p>
          </div>
          <button
            onClick={() => onNavigateTab?.('oversigt')}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Se emails
          </button>
        </div>
      </div>

      {/* Desktop: Horizontal timeline */}
      <div className="hidden md:block bg-white rounded-lg border p-6">
        <div className="relative flex items-start justify-between">
          {/* Connector line */}
          <div className="absolute top-6 left-8 right-8 h-0.5 bg-gray-200 z-0" />
          <div
            className="absolute top-6 left-8 h-0.5 bg-green-400 z-0 transition-all duration-500"
            style={{ width: `${Math.max(0, ((doneCount - 1) / (steps.length - 1)) * 100)}%`, maxWidth: 'calc(100% - 64px)' }}
          />

          {steps.map((step, i) => {
            const cfg = STATUS_CONFIG[step.status]
            const StepIcon = STEP_ICONS[step.key] || Circle
            const StatusIcon = cfg.icon
            const isClickable = !!step.linkTab && !!onNavigateTab

            return (
              <div
                key={step.key}
                className={`relative z-10 flex flex-col items-center text-center w-28 ${isClickable ? 'cursor-pointer group' : ''}`}
                onClick={() => isClickable && onNavigateTab?.(step.linkTab!)}
              >
                {/* Circle */}
                <div className={`w-12 h-12 rounded-full ${cfg.bg} ${cfg.border} border-2 flex items-center justify-center mb-2 transition-transform ${isClickable ? 'group-hover:scale-110' : ''}`}>
                  <StepIcon className={`w-5 h-5 ${cfg.text}`} />
                </div>

                {/* Label */}
                <p className={`text-xs font-semibold ${cfg.text}`}>{step.label}</p>

                {/* Status badge */}
                <span className={`inline-flex items-center gap-0.5 mt-1 text-[10px] font-medium ${cfg.text}`}>
                  <StatusIcon className={`w-3 h-3 ${cfg.iconColor}`} />
                  {cfg.label}
                </span>

                {/* Detail */}
                {step.detail && (
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight max-w-[100px]">
                    {step.detail}
                  </p>
                )}

                {/* Date */}
                {step.date && (
                  <p className="text-[10px] text-gray-300 mt-0.5">
                    {new Date(step.date).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Mobile: Vertical timeline */}
      <div className="md:hidden space-y-0">
        {steps.map((step, i) => {
          const cfg = STATUS_CONFIG[step.status]
          const StepIcon = STEP_ICONS[step.key] || Circle
          const StatusIcon = cfg.icon
          const isClickable = !!step.linkTab && !!onNavigateTab
          const isLast = i === steps.length - 1

          return (
            <div key={step.key} className="relative flex gap-3">
              {/* Vertical line */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 shrink-0 rounded-full ${cfg.bg} ${cfg.border} border-2 flex items-center justify-center`}>
                  <StepIcon className={`w-4 h-4 ${cfg.text}`} />
                </div>
                {!isLast && (
                  <div className={`w-0.5 flex-1 min-h-[24px] ${step.status === 'done' ? 'bg-green-300' : 'bg-gray-200'}`} />
                )}
              </div>

              {/* Content */}
              <div
                className={`flex-1 pb-4 ${isClickable ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
                onClick={() => isClickable && onNavigateTab?.(step.linkTab!)}
              >
                <div className={`rounded-lg ${cfg.bg} ${cfg.border} border p-3`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-semibold ${cfg.text}`}>{step.label}</p>
                      <span className={`inline-flex items-center gap-1 text-xs ${cfg.text}`}>
                        <StatusIcon className={`w-3 h-3 ${cfg.iconColor}`} />
                        {cfg.label}
                      </span>
                    </div>
                    {isClickable && (
                      <ChevronRight className={`w-4 h-4 ${cfg.text} opacity-50`} />
                    )}
                  </div>
                  {(step.detail || step.date) && (
                    <div className="mt-1 flex items-center gap-2">
                      {step.detail && (
                        <p className="text-xs text-gray-500">{step.detail}</p>
                      )}
                      {step.date && (
                        <p className="text-xs text-gray-400">
                          {new Date(step.date).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
