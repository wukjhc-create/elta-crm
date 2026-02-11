'use client'

import { useState, useEffect } from 'react'
import { X, Save, Trash2 } from 'lucide-react'
import {
  createTemplate,
  deleteTemplate,
} from '@/lib/actions/calculator'
import type {
  CalculatorInput,
  TemplateWithCreator,
} from '@/types/calculator.types'
import { formatCurrency } from '@/lib/utils/format'

interface SaveTemplateDialogProps {
  isOpen: boolean
  onClose: () => void
  config: CalculatorInput
  systemSize: number
  totalPrice: number
  onSaved: () => void
}

export function SaveTemplateDialog({
  isOpen,
  onClose,
  config,
  systemSize,
  totalPrice,
  onSaved,
}: SaveTemplateDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Navn er påkrævet')
      return
    }

    setIsLoading(true)
    setError(null)

    const result = await createTemplate({
      name: name.trim(),
      description: description.trim() || undefined,
      config,
      systemSize,
      totalPrice,
    })

    setIsLoading(false)

    if (result.success) {
      setName('')
      setDescription('')
      onSaved()
      onClose()
    } else {
      setError(result.error || 'Kunne ikke gemme skabelon')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="save-template-title" className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 id="save-template-title" className="text-xl font-semibold">Gem som skabelon</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full" aria-label="Luk">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">
              Navn *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="F.eks. Standard villa 6kWp"
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="description" className="text-sm font-medium">
              Beskrivelse
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valgfri beskrivelse af skabelonen..."
              rows={3}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              disabled={isLoading}
            />
          </div>

          <div className="p-3 bg-gray-50 rounded-md text-sm">
            <p className="font-medium mb-2">Konfiguration der gemmes:</p>
            <div className="grid grid-cols-2 gap-1 text-gray-600">
              <span>Anlægsstørrelse:</span>
              <span className="font-medium">{systemSize} kWp</span>
              <span>Totalpris:</span>
              <span className="font-medium">{formatCurrency(totalPrice)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
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
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isLoading ? 'Gemmer...' : 'Gem skabelon'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface LoadTemplateDialogProps {
  isOpen: boolean
  onClose: () => void
  templates: TemplateWithCreator[]
  onSelect: (template: TemplateWithCreator) => void
  onRefresh: () => void
}

export function LoadTemplateDialog({
  isOpen,
  onClose,
  templates,
  onSelect,
  onRefresh,
}: LoadTemplateDialogProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Er du sikker på at du vil slette denne skabelon?')) return

    setIsDeleting(id)
    const result = await deleteTemplate(id)
    setIsDeleting(null)

    if (result.success) {
      onRefresh()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="load-template-title" className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 id="load-template-title" className="text-xl font-semibold">Indlæs skabelon</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full" aria-label="Luk">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {templates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Ingen skabeloner fundet</p>
              <p className="text-sm mt-1">Gem en beregning som skabelon for at komme i gang</p>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => {
                    onSelect(template)
                    onClose()
                  }}
                  className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium">{template.name}</h3>
                      {template.description && (
                        <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-sm text-gray-500">
                        <span>{template.template_data?.systemSize} kWp</span>
                        <span>{formatCurrency(template.template_data?.totalPrice || 0)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleDelete(template.id, e)}
                        disabled={isDeleting === template.id}
                        className="p-1.5 hover:bg-red-100 rounded text-gray-400 hover:text-red-600 disabled:opacity-50"
                        title="Slet skabelon"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border rounded-md hover:bg-gray-50"
          >
            Luk
          </button>
        </div>
      </div>
    </div>
  )
}
