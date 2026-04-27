'use client'

import { useState, useRef } from 'react'
import {
  CheckCircle,
  Circle,
  Camera,
  Loader2,
  Trash2,
  Lock,
} from 'lucide-react'
import type { ChecklistItem, ServiceCaseAttachment } from '@/types/service-cases.types'

interface CompletionChecklistProps {
  items: ChecklistItem[]
  attachments: ServiceCaseAttachment[]
  onToggle: (key: string, completed: boolean) => void
  onUpload: (key: string, file: File) => Promise<void>
  onDeleteAttachment?: (attachmentId: string) => Promise<void>
  canClose: boolean
  disabled?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  inverter_photo: 'Inverter',
  tavle_photo: 'Eltavle',
  panel_photo: 'Paneler',
  before_photo: 'Før arbejde',
  after_photo: 'Efter arbejde',
  notes_added: 'Noter',
}

export function CompletionChecklist({
  items,
  attachments,
  onToggle,
  onUpload,
  onDeleteAttachment,
  canClose,
  disabled,
}: CompletionChecklistProps) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const requiredItems = items.filter((i) => i.required)
  const optionalItems = items.filter((i) => !i.required)
  const completedRequired = requiredItems.filter((i) => i.completed).length
  const totalRequired = requiredItems.length
  const progress = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 100

  const handleFileSelect = async (key: string, file: File) => {
    setUploadingKey(key)
    try {
      await onUpload(key, file)
    } finally {
      setUploadingKey(null)
    }
  }

  const getAttachmentsForKey = (key: string) => {
    return attachments.filter((a) => a.category === key)
  }

  const isPhotoItem = (key: string) => key.endsWith('_photo')

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header with progress */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
            Afslutnings-checkliste
          </h3>
          <span className={`text-sm font-bold ${progress === 100 ? 'text-green-600' : 'text-amber-600'}`}>
            {completedRequired}/{totalRequired} påkrævet
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              progress === 100 ? 'bg-green-500' : progress > 50 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Required items */}
      <div className="divide-y">
        {requiredItems.map((item) => {
          const itemAttachments = getAttachmentsForKey(item.key)
          const isPhoto = isPhotoItem(item.key)
          const isUploading = uploadingKey === item.key

          return (
            <div key={item.key} className="p-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onToggle(item.key, !item.completed)}
                  disabled={disabled || (isPhoto && itemAttachments.length === 0)}
                  className="shrink-0"
                >
                  {item.completed ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium ${item.completed ? 'text-green-700 line-through' : 'text-gray-900'}`}>
                    {item.label}
                  </span>
                  <span className="ml-1.5 text-[10px] font-semibold text-red-500 uppercase">Påkrævet</span>
                </div>

                {isPhoto && (
                  <>
                    <input
                      ref={(el) => { fileInputRefs.current[item.key] = el }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileSelect(item.key, file)
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[item.key]?.click()}
                      disabled={disabled || isUploading}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      {isUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      {isUploading ? 'Uploader...' : 'Tag foto'}
                    </button>
                  </>
                )}
              </div>

              {/* Show uploaded photos */}
              {itemAttachments.length > 0 && (
                <div className="mt-2 ml-8 flex gap-2 flex-wrap">
                  {itemAttachments.map((att) => (
                    <div key={att.id} className="relative group w-16 h-16 rounded-md overflow-hidden border">
                      <img src={att.file_url} alt={att.file_name} className="w-full h-full object-cover" />
                      {onDeleteAttachment && !disabled && (
                        <button
                          type="button"
                          onClick={() => onDeleteAttachment(att.id)}
                          className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Optional items */}
      {optionalItems.length > 0 && (
        <>
          <div className="px-4 py-2 bg-gray-50 border-t border-b">
            <span className="text-xs font-medium text-gray-500 uppercase">Valgfrit</span>
          </div>
          <div className="divide-y">
            {optionalItems.map((item) => {
              const itemAttachments = getAttachmentsForKey(item.key)
              const isPhoto = isPhotoItem(item.key)
              const isUploading = uploadingKey === item.key

              return (
                <div key={item.key} className="p-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onToggle(item.key, !item.completed)}
                      disabled={disabled}
                      className="shrink-0"
                    >
                      {item.completed ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300" />
                      )}
                    </button>
                    <span className={`text-sm flex-1 ${item.completed ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                      {item.label}
                    </span>
                    {isPhoto && (
                      <>
                        <input
                          ref={(el) => { fileInputRefs.current[item.key] = el }}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleFileSelect(item.key, file)
                            e.target.value = ''
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[item.key]?.click()}
                          disabled={disabled || isUploading}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md hover:bg-gray-50 disabled:opacity-50"
                        >
                          {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                          {isUploading ? 'Uploader...' : 'Foto'}
                        </button>
                      </>
                    )}
                  </div>
                  {itemAttachments.length > 0 && (
                    <div className="mt-2 ml-8 flex gap-2 flex-wrap">
                      {itemAttachments.map((att) => (
                        <div key={att.id} className="relative group w-16 h-16 rounded-md overflow-hidden border">
                          <img src={att.file_url} alt={att.file_name} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Close blocking warning */}
      {!canClose && (
        <div className="p-3 bg-amber-50 border-t border-amber-100 flex items-center gap-2 text-sm text-amber-800">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Alle påkrævede punkter skal udfyldes for at lukke sagen</span>
        </div>
      )}
    </div>
  )
}
