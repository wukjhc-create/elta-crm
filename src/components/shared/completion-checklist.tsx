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
  /** MB-3: tjeklisten er komplet (banneret følger den; lukning kræver stadig cases.close) */
  checklistComplete?: boolean
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
  checklistComplete,
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
                  className="shrink-0 -m-2 p-2"
                  aria-label={item.completed ? `Fjern flueben: ${item.label}` : `Markér udført: ${item.label}`}
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
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        // MB2-9: flere fotos pr. valg (uploades ét ad gangen)
                        const files = Array.from(e.target.files ?? [])
                        e.target.value = ''
                        for (const f of files) await handleFileSelect(item.key, f)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[item.key]?.click()}
                      disabled={disabled || isUploading}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 sm:px-2.5 sm:py-1.5 min-h-11 sm:min-h-0 text-sm sm:text-xs font-medium border rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      {isUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5" />
                      )}
                      {isUploading ? 'Uploader...' : 'Foto'}
                    </button>
                  </>
                )}
              </div>

              {/* Show uploaded photos */}
              {itemAttachments.length > 0 && (
                <div className="mt-2 ml-8 flex gap-2 flex-wrap">
                  {itemAttachments.map((att) => (
                    <div key={att.id} className="relative w-16 h-16 rounded-md overflow-hidden border">
                      {/* M-1 (pilot-review 2026-10-15): tryk på fotoet åbner det — før slettede et tryk fotoet uden
                          bekræftelse (skraldespanden var kun synlig ved hover, som ikke findes på telefon) */}
                      <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                        <img src={att.file_url} alt={att.file_name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      </a>
                      {onDeleteAttachment && !disabled && (att as { deletable_by_me?: boolean }).deletable_by_me !== false && (
                        <button
                          type="button"
                          onClick={() => { if (window.confirm('Slet foto?')) onDeleteAttachment(att.id) }}
                          className="absolute top-0 right-0 w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-bl-md"
                          aria-label="Slet foto"
                          data-testid="checklist-photo-delete"
                        >
                          <Trash2 className="w-4 h-4" />
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
                      className="shrink-0 -m-2 p-2"
                      aria-label={item.completed ? `Fjern flueben: ${item.label}` : `Markér udført: ${item.label}`}
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
                          multiple
                          className="hidden"
                          onChange={async (e) => {
                            // MB2-9: flere fotos pr. valg
                            const files = Array.from(e.target.files ?? [])
                            e.target.value = ''
                            for (const f of files) await handleFileSelect(item.key, f)
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[item.key]?.click()}
                          disabled={disabled || isUploading}
                          className="inline-flex items-center gap-1.5 px-3 py-2.5 sm:px-2.5 sm:py-1.5 min-h-11 sm:min-h-0 text-sm sm:text-xs font-medium border rounded-md hover:bg-gray-50 disabled:opacity-50"
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
                        <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer" className="relative block w-16 h-16 rounded-md overflow-hidden border">
                          <img src={att.file_url} alt={att.file_name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Close blocking warning — MB-3: følger tjeklisten; komplet uden lukkeret → kontoret lukker */}
      {!(checklistComplete ?? canClose) ? (
        <div className="p-3 bg-amber-50 border-t border-amber-100 flex items-center gap-2 text-sm text-amber-800">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Alle påkrævede punkter skal udfyldes for at lukke sagen</span>
        </div>
      ) : !canClose ? (
        <div className="p-3 bg-emerald-50 border-t border-emerald-100 text-sm text-emerald-800" data-testid="checklist-complete-office-closes">
          Tjeklisten er komplet — kontoret lukker sagen
        </div>
      ) : null}
    </div>
  )
}
